import { inject as service } from "@ember/service";
import { setOwner } from "@ember/application";
import Promise from "rsvp";
import ChatThread from "discourse/plugins/chat/discourse/models/chat-thread";
import { tracked } from "@glimmer/tracking";
import { TrackedObject } from "@ember-compat/tracked-built-ins";

/*
  The ChatThreadsManager is responsible for managing the loaded chat threads
  for a ChatChannel model.

  It provides helpers to facilitate using and managing loaded threads instead of constantly
  fetching them from the server.
*/

export default class ChatThreadsManager {
  @service chatSubscriptionsManager;
  @service chatTrackingStateManager;
  @service chatApi;
  @service chat;
  @service currentUser;
  @tracked _cached = new TrackedObject();

  constructor(owner) {
    setOwner(this, owner);
  }

  async find(channelId, threadId, options = { fetchIfNotFound: true }) {
    const existingThread = this.#findStale(threadId);
    if (existingThread) {
      return Promise.resolve(existingThread);
    } else if (options.fetchIfNotFound) {
      return this.#find(channelId, threadId);
    } else {
      return Promise.resolve();
    }
  }

  async index(channelId) {
    return this.#loadIndex(channelId).then((result) => {
      const threads = result.threads.map((thread) => {
        return this.chat.activeChannel.threadsManager.store(
          this.chat.activeChannel,
          thread
        );
      });

      this.chatTrackingStateManager.setupChannelThreadState(
        this.chat.activeChannel,
        result.tracking
      );

      return { threads, meta: result.meta };
    });
  }

  get threads() {
    return Object.values(this._cached);
  }

  store(channel, threadObject) {
    let model = this.#findStale(threadObject.id);

    if (!model) {
      if (threadObject instanceof ChatThread) {
        model = threadObject;
      } else {
        model = new ChatThread(channel, threadObject);
      }

      this.#cache(model);
    }

    if (
      threadObject.meta?.message_bus_last_ids?.thread_message_bus_last_id !==
      undefined
    ) {
      model.threadMessageBusLastId =
        threadObject.meta.message_bus_last_ids.thread_message_bus_last_id;
    }

    return model;
  }

  async #find(channelId, threadId) {
    return this.chatApi.thread(channelId, threadId);
  }

  #cache(thread) {
    this._cached[thread.id] = thread;
  }

  #findStale(id) {
    return this._cached[id];
  }

  async #loadIndex(channelId) {
    return this.chatApi.threads(channelId);
  }
}
