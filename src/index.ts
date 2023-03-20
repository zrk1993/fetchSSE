import nodeFetch from "node-fetch";
import { RequestInfo, RequestInit, Response } from "node-fetch";
import { createParser } from "eventsource-parser";

type onMessage = (data: string) => void;

export default async function fetchSSE(
  url: URL | RequestInfo,
  init: RequestInit & { onMessage: onMessage }
): Promise<Response> {
  const { onMessage, ...fetchOptions } = init;
  const res = await nodeFetch(url, fetchOptions);

  if (!res.ok) {
    let reason: string;
    try {
      reason = await res.text();
    } catch (err) {
      reason = res.statusText;
    }
    throw new Error(`ChatGPT error ${res.status}: ${reason}`);
  }
  const parser = createParser((event) => {
    if (event.type === "event") {
      onMessage(event.data);
    }
  });
  if (!(res.body as any).getReader) {
    const body = res.body;
    if (!body.on || !body.read) {
      throw new Error('unsupported "fetch" implementation');
    }
    body.on("readable", () => {
      let chunk: any;
      while (null !== (chunk = body.read())) {
        parser.feed(chunk.toString());
      }
    });
  } else {
    for await (const chunk of streamAsyncIterable(res.body)) {
      const str = new TextDecoder().decode(chunk);
      parser.feed(str);
    }
  }

  return res;
}

async function* streamAsyncIterable(stream) {
  const reader = stream.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        return;
      }
      yield value;
    }
  } finally {
    reader.releaseLock();
  }
}
