/*
 * File: server.ts
 * Project: www
 * File Created: Tuesday, 8th August 2023 3:35:58 pm
 * Author: Wilson Hobbs (wilson@lobby.so)
 * -----
 * Last Modified: Friday, 6th October 2023 12:49:34 am
 * Modified By: Wilson Hobbs (wilson@lobby.so>)
 * -----
 * Copyright (c) 2023 Lobby Technologies, Inc.
 */
import { LOBBY_ORGANIZATION_ID, WAREHOUSE_ORGANIZATION_ID } from "$lib/const";
import * as coreApi from "$lib/server/core";
import { dataBots } from "$lib/server/supabase/data";
import { realtimeClient } from "$lib/services/supabase-broadcast/client";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

export const POST: RequestHandler = async ({
  request,
  locals: { getSession, getOrganization, hasScope, mixpanel },
}) => {
  // Check if user is logged in
  const session = await getSession();
  const organization = await getOrganization();
  if (!session || !organization) error(401, "Unauthorized");

  // Check if user has permission to view bots
  const canView = await hasScope("messages.send");
  if (!canView)
    error(403, {
      message:
        "Forbidden: you do not have the messages.send privilege. Contact your organization administrator to request access.",
    });

  // Get request params
  const user_id = session.user.id;

  // Check if request body is valid
  const body = await request.json();
  const message = body.message;
  const model = body.model;
  const bot_id = body.bot_id;
  const reflect_message = body.reflect_message;
  const stream_channel = body.stream_channel;

  const conversation_id = crypto.randomUUID();

  if (!bot_id || !user_id || !conversation_id || !message || !model) {
    error(400, { message: "Bad Request" });
  }

  const { data: bot, error: error3 } = await dataBots.get(bot_id);

  if (!bot) {
    error(404, { message: "Bot not found" });
  }

  if (error3) {
    error(500, { message: "Internal Server Error" });
  }

  let channel: RealtimeChannel | null = null;

  if (stream_channel) {
    channel = realtimeClient.channel(stream_channel);
    channel.subscribe();
  }

  let sentFirstMessage = false;

  // Send message to Core backend
  let msg = await coreApi.chat.createCompletion(
    {
      message: message,
      // don't need to specify
      chat_session_id: conversation_id,
      user_id: session.user.id,
      organization_id: organization.id,
      model: model,
      bot_id: bot.id,
    },
    async (delta) => {
      // using this because of weird issue of start message not being sent
      if (!sentFirstMessage) {
        channel?.send({
          type: "broadcast",
          event: "publication",
          data: { type: "start" },
        });

        sentFirstMessage = true;
      }
      channel?.send({
        type: "broadcast",
        event: "publication",
        data: { content: delta, type: "token" },
      });
    }
  );

  channel?.send({
    type: "broadcast",
    event: "publication",
    data: { type: "end" },
  });

  channel?.unsubscribe();

  if (reflect_message) {
    msg = await coreApi.chat.createCompletion({
      message: `${reflect_message} ${msg}`,
      // don't need to specify
      chat_session_id: conversation_id,
      user_id: session.user.id,
      organization_id: organization.id,
      model: model,
      bot_id: bot.id,
    });
  }

  // Return response
  return new Response(JSON.stringify({ message: msg }));
};
