/*
 * File: prompts.ts
 * Project: www
 * File Created: Monday, 18th September 2023 10:53:37 pm
 * Author: Wilson Hobbs (wilson@lobby.so)
 * -----
 * Last Modified: Wednesday, 18th October 2023 2:42:22 am
 * Modified By: Wilson Hobbs (wilson@lobby.so>)
 * -----
 * Copyright (c) 2023 Lobby Technologies, Inc.
 */

import {
  INFO_BOT_ID,
  JERALD_LINKS_BOT_ID,
  JERALD_PROMPT_BOT_ID,
  JERALD__SYSTEM_PROMPT_PARSER_BOT_ID,
  JERALD__SYSTEM_PROMPT_REFINER_BOT_ID,
} from "$lib/const";
import type { Message } from "$lib/models";
import ObjectID from "bson-objectid";
import { fetchJson } from "$lib/util/fetch";

const promptFromTopic = (intent: string) =>
  `Subject matter expert specializing in ${intent}`;
const reflectMessage =
  "Improve this system prompt, if subconcepts do not exist, please add them.";

export async function generateSystemPromptFromTopic(
  topic: string,
  streamChannel?: string
) {
  const initalSystemPrompt = await sendSingletonChat({
    id: JERALD_PROMPT_BOT_ID,
    message: promptFromTopic(topic),
  });
  const parsedSystemPrompt = await sendSingletonChat({
    id: JERALD__SYSTEM_PROMPT_PARSER_BOT_ID,
    message: initalSystemPrompt,
  });
  const finalPrompt = await sendSingletonChat({
    id: JERALD__SYSTEM_PROMPT_REFINER_BOT_ID,
    message: parsedSystemPrompt,
    streamChannel,
  });
  return finalPrompt;
}

export function generateWikipediaLinksFromSystemPrompt(
  systemPrompt: string,
  streamChannel?: string
) {
  return sendSingletonChat({
    id: JERALD_LINKS_BOT_ID,
    message: systemPrompt,
    streamChannel,
  });
}

export function generateInsightFromMessages(
  messages: Message[]
): Promise<string> {
  // check if there are at least 6 messages
  if (messages.length < 6) {
    throw new Error("Not enough messages to generate insight");
  }

  // get the last 6 messages
  const messagesToAnalyze = messages.slice(-6);

  // if first message is not from the student, modify the array to have the first message be from the student
  // in our case student messages have type 'human'
  while (
    messagesToAnalyze.length > 0 &&
    messagesToAnalyze[0].type !== "human"
  ) {
    messagesToAnalyze.shift(); // removes the first element from the array
  }

  // if there are no messages from the student, throw an error
  if (messagesToAnalyze.length <= 2) {
    throw new Error("Not enough messages to generate insight");
  }

  // turn the array into the following format
  // 	STUDENT
  // ..message
  // AI TUTOR
  // ..message
  const conversationToAnalyze: string = messagesToAnalyze.reduce(
    (acc, message) => {
      if (message.type === "human") {
        acc += `# STUDENT:\n${message.data.content}\n\n`;
      } else if (message.type === "ai") {
        acc += `# AI TUTOR:\n${message.data.content}\n\n`;
      }
      return acc;
    },
    ""
  );

  return sendSingletonChat({ id: INFO_BOT_ID, message: conversationToAnalyze });
}

// creates a one-off conversation
export async function sendSingletonChat({
  id,
  message,
  reflect_message,
  streamChannel,
}: {
  id: string;
  message: string;
  reflect_message?: string;
  streamChannel?: string;
}): Promise<string> {
  try {
    // if currentNamespace is not empty and currentIndex is empty, then we have an error
    if (!message) {
      throw new Error("No message provided");
    }

    // call the chat endpoint here with the state.currentInput
    const res = await getSharedBotCompletion({
      id,
      message,
      reflect_message,
      stream_channel: streamChannel,
    });
    const data = await res.json();
    if (!data.message) {
      throw new Error("No message provided");
    }
    return data.message;
  } catch (error) {
    // Handle any errors that occur during the fetch request
    console.log(error);
    throw error;
  }
}

export function getSharedBotCompletion({
  id,
  message,
  reflect_message,
  stream_channel,
}: {
  id: string;
  message: string;
  reflect_message?: string;
  stream_channel?: string;
}) {
  return fetchJson<{
    message: string;
  }>("/api/bot-builder", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      conversation_id: ObjectID(),
      message,
      model: "mixtral",
      bot_id: id,
      reflect_message,
      stream_channel,
    }),
  });
}
