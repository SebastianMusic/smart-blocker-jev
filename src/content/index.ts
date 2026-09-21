import type { Message } from "../shared/messages";
import { extractPayload } from "./extract";

browser.runtime.onMessage.addListener((msg: Message) => {
  if (msg.type === "extract") return Promise.resolve(extractPayload());
});

browser.runtime.sendMessage({ type: "page-ready", url: location.href } satisfies Message);
