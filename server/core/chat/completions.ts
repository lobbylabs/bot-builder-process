/*
 * File: completions.ts
 * Project: www
 * File Created: Monday, 2nd October 2023 1:18:28 pm
 * Author: Wilson Hobbs (wilson@lobby.so)
 * -----
 * Last Modified: Tuesday, 3rd October 2023 11:46:02 pm
 * Modified By: Wilson Hobbs (wilson@lobby.so>)
 * -----
 * Copyright (c) 2023 Lobby Technologies, Inc.
 */

import type { DataTables, Json } from "$lib/database.types";
import { completionStream, jinaEmbed } from "$lib/external/openai";
import {
  dataBotDocuments,
  dataBots,
  dataConversations,
  dataMessages,
} from "$lib/server/supabase/data";
import { publicModuleSets } from "$lib/server/supabase/public";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { c } from "svelte-highlight/languages";
import { encoding_for_model, type TiktokenModel } from "tiktoken";

const TOTAL_TOKENS_ALLOWED = Math.floor(8192 * 0.8);

function approximateNumTokenFromMessages(
  messages: ChatCompletionMessageParam[]
): number {
  let total = 0;

  for (let i = 0; i < messages.length; i++) {
    const message = messages[i];
    if (typeof message.content !== "string") continue;

    // https://platform.openai.com/tokenizer
    // A helpful rule of thumb is that one token generally corresponds to ~4 characters of text for common English text.
    // This translates to roughly ¾ of a word (so 100 tokens ~= 75 words).
    total += message.content.trim().split(/\s+/).length * 1.25;
  }
  return total;
}

function numTokenFromMessages(
  messages: ChatCompletionMessageParam[],
  encodingName: TiktokenModel = "text-embedding-ada-002"
): number {
  let total = 0;
  const encodingModel = encoding_for_model(encodingName);
  for (let i = 0; i < messages.length; i++) {
    const message = messages[i];
    if (typeof message.content !== "string") continue;

    total += encodingModel.encode(message.content).length;
  }
  return total;
}

interface CreateCompletionParams {
  message: string;
  organization_id: string;
  user_id: string;
  chat_session_id: string;
  // index_id?: string;
  bot_id: string;
  include_sources?: boolean;
  model?: "mixtral";
  max_tokens?: number;
  temperature?: number;
  exclude_history?: boolean;
  brevity?: boolean;
}

async function _messages(data: CreateCompletionParams) {
  const messageHistoryTokensAllowed = Math.floor(TOTAL_TOKENS_ALLOWED * 0.6);

  let { data: messageData, error } =
    await dataMessages.getMessagesByConversationUUID(
      data.user_id,
      data.chat_session_id,
      false,
      40
    );

  let messageHistory = messageData
    ? (messageData as DataTables<"messages">[])
    : [];

  let messages: ChatCompletionMessageParam[] = [];

  let approxTokenCount = 0;

  for (let i = 0; i < messageHistory.length; i++) {
    const history = messageHistory[i];

    if (
      i === 0 ||
      messageHistory[i].message_type !== messageHistory[i - 1].message_type
    ) {
      messages.push({
        role: history.message_type === "ai" ? "assistant" : "user",
        content: history.message_content,
      });
    }

    approxTokenCount = approximateNumTokenFromMessages(messages);

    if (approxTokenCount >= messageHistoryTokensAllowed) break;
  }

  let totalTokens = numTokenFromMessages(messages);

  while (true) {
    if (totalTokens <= messageHistoryTokensAllowed) break;

    messages.splice(1, 1);

    totalTokens = numTokenFromMessages(messages);
  }

  const { data: bot } = await dataBots.get(data.bot_id);

  let inputEmbed =
    [...messages]
      .reverse()
      .slice(-4)
      .map((message) => {
        return `${message.role} - ${message.content}`;
      })
      .join("\n") + `\n\nuser - ${data.message}`;

  const wholeEmbedding = await jinaEmbed(inputEmbed);
  const simpleEmbedding = await jinaEmbed(data.message);

  // get context from module sets

  const { data: convo, error: convoError } = await dataConversations.getByUUID(
    data.chat_session_id
  );

  // TODO: handle error
  if (!convo || convoError) {
    throw new Error("Conversation not found");
  }

  const { data: moduleSet, error: moduleSetError } = await publicModuleSets.get(
    convo.id,
    data.user_id
  );

  // TODO: handle error
  if (!moduleSet || moduleSetError) {
    throw new Error("ModuleSet not found");
  }

  const contextPromises = moduleSet.bot_ids.map(async (botId) => {
    return dataBotDocuments.documentSimilaritySearch(
      data.organization_id,
      botId as string,
      data.user_id,
      wholeEmbedding,
      simpleEmbedding
    );
  });

  const chunksArray = await Promise.all(contextPromises);
  let chunks: {
    id: number;
    bot_id: string;
    organization_id: string;
    document_id: number;
    chunk_content: string;
    prev_chunk: number;
    next_chunk: number;
    similarity: number;
  }[] = [];

  chunksArray.forEach((chunk) => {
    if (chunk.error) {
      return;
    }
    if (chunk.data) {
      chunks.push(...chunk.data);
    }
  });

  let context = "";
  if (chunks) {
    context = (
      chunks as unknown as { similarity: any; chunk_content: string }[]
    )
      .map((chunk) => {
        return chunk.chunk_content;
      })
      .join("\n");
  }

  const systemMessage = `System Message:
${bot?.system_prompt || ""}

Context:
${context}`;

  const brevity = "Keep it short, don't use lists. Format for text message.";
  messages = [
    { role: "system", content: systemMessage },
    ...messages.reverse(),
    {
      role: "user",
      content: data.brevity ? `${brevity} ` + data.message : data.message,
    },
  ];

  return messages;
}

export async function createCompletion(
  data: CreateCompletionParams,
  callback?: (delta: string) => Promise<void>
) {
  let res = "";
  let stream = await completionStream(await _messages(data), data.max_tokens);

  for await (const part of stream) {
    const content = part.choices[0]?.delta?.content || "";
    if (
      part.choices[0].finish_reason ||
      content === null ||
      content === undefined
    ) {
      break;
    }
    res += content;
    callback && (await callback(content));
  }

  return res;
}
