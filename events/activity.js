import { get, set } from "../lib/store.js";

export default {
  event: "message_created",
  handler: (payload) => {
    if (payload.botId || !payload.userId) return;
    const spoke = get("spoke") ?? {};
    spoke[payload.userId] = Date.now();
    set("spoke", spoke);

    const afk = get("afk") ?? {};
    const entry = afk[payload.userId];
    if (!entry || entry.messageId === payload.id) return;
    delete afk[payload.userId];
    set("afk", afk);
  },
};
