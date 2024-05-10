/*
 * File: index.ts
 * Project: www
 * File Created: Monday, 18th September 2023 10:53:30 pm
 * Author: Wilson Hobbs (wilson@lobby.so)
 * -----
 * Last Modified: Wednesday, 18th October 2023 2:44:28 am
 * Modified By: Wilson Hobbs (wilson@lobby.so>)
 * -----
 * Copyright (c) 2023 Lobby Technologies, Inc.
 */
export { createJeraldBot } from './database';
export {
	generateInsightFromMessages,
	generateSystemPromptFromTopic,
	generateWikipediaLinksFromSystemPrompt,
	sendSingletonChat,
	getSharedBotCompletion
} from './prompts';
