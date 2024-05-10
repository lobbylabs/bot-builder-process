/*
 * File: database.ts
 * Project: www
 * File Created: Monday, 18th September 2023 10:53:41 pm
 * Author: Wilson Hobbs (wilson@lobby.so)
 * -----
 * Last Modified: Wednesday, 18th October 2023 2:57:59 am
 * Modified By: Wilson Hobbs (wilson@lobby.so>)
 * -----
 * Copyright (c) 2023 Lobby Technologies, Inc.
 */
import { agentIngestionHelper } from '$lib/services/ingest';
import * as studioApi from '$lib/services/studio-api';

const JERALD_VERSION = '20231018';

const BASE_URL = 'https://en.wikipedia.org/wiki';

export async function createJeraldBot(
	data: {
		user_id: string;
		name: string;
		description: string;
		imageType: string;
		access: string;
		private: boolean;
		organization_id: string;
		systemPrompt: string;
		links: string;
	},
	stream = true
) {
	const response = await studioApi.chat.createBot({
		name: data.name,
		user_id: data.user_id,
		description: data.description,
		system_prompt: data.systemPrompt,
		image_type: data.imageType,
		organization_id: data.organization_id,
		access: data.access,
		private: data.private,
		jerald_version: JERALD_VERSION
	});

	const botData = await response.json();

	if (data.links && data.links.length > 0) {
		await agentIngestionHelper.ingestJerald({
			bot_id: botData.id,
			bot_organization_id: botData.organization_id,
			user_id: data.user_id,
			embedding_model: 'jina-embeddings-v2-base-en',
			type: 'web',
			base_url: [BASE_URL],
			urls: agentIngestionHelper.parseUrls([data.links]),
			recursive: [false],
			max_depths: [0]
		});
	}

	return botData;
}
