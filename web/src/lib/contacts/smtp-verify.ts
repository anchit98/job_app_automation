import dns from "dns/promises";
import net from "net";

export type SmtpProbeResult = "accepted" | "rejected" | "unknown";

export type SmtpCapability = "available" | "unavailable" | "unknown";

let cachedCapability: SmtpCapability = "unknown";

export function getSmtpCapability(): SmtpCapability {
  return cachedCapability;
}

export function setSmtpCapability(capability: SmtpCapability) {
  cachedCapability = capability;
}

async function resolveMxHosts(domain: string): Promise<string[]> {
  try {
    const records = await dns.resolveMx(domain);
    return records
      .sort((a, b) => a.priority - b.priority)
      .map((record) => record.exchange.replace(/\.$/, ""));
  } catch {
    return [];
  }
}

function readSmtpResponse(socket: net.Socket): Promise<string> {
  return new Promise((resolve, reject) => {
    const onData = (chunk: Buffer) => {
      cleanup();
      resolve(chunk.toString("utf8"));
    };
    const onError = (error: Error) => {
      cleanup();
      reject(error);
    };
    const onTimeout = () => {
      cleanup();
      reject(new Error("SMTP timeout"));
    };
    const cleanup = () => {
      socket.off("data", onData);
      socket.off("error", onError);
      socket.off("timeout", onTimeout);
    };
    socket.once("data", onData);
    socket.once("error", onError);
    socket.once("timeout", onTimeout);
  });
}

async function sendCommand(
  socket: net.Socket,
  command: string,
): Promise<string> {
  socket.write(`${command}\r\n`);
  return readSmtpResponse(socket);
}

async function probeRcpt(
  mxHost: string,
  email: string,
  timeoutMs = 10000,
): Promise<SmtpProbeResult> {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: mxHost, port: 25 });
    socket.setTimeout(timeoutMs);

    const finish = (result: SmtpProbeResult) => {
      try {
        socket.destroy();
      } catch {
        // ignore
      }
      resolve(result);
    };

    socket.on("error", () => finish("unknown"));
    socket.on("timeout", () => finish("unknown"));

    socket.on("connect", async () => {
      try {
        const greeting = await readSmtpResponse(socket);
        if (!greeting.startsWith("220")) {
          finish("unknown");
          return;
        }

        const ehlo = await sendCommand(socket, "EHLO jobapp.local");
        if (!ehlo.startsWith("250")) {
          finish("unknown");
          return;
        }

        const mailFrom = await sendCommand(socket, "MAIL FROM:<verify@jobapp.local>");
        if (!mailFrom.startsWith("250")) {
          finish("unknown");
          return;
        }

        const rcpt = await sendCommand(socket, `RCPT TO:<${email}>`);
        await sendCommand(socket, "QUIT");

        if (/^250/.test(rcpt)) finish("accepted");
        else if (/^(550|551|552|553|554)/.test(rcpt)) finish("rejected");
        else finish("unknown");
      } catch {
        finish("unknown");
      }
    });
  });
}

export async function isCatchAllDomain(domain: string): Promise<boolean> {
  const mxHosts = await resolveMxHosts(domain);
  if (mxHosts.length === 0) return false;

  const probes = [
    `__no_such_user_${Date.now()}__@${domain}`,
    `__no_such_user_${Date.now() + 1}__@${domain}`,
  ];

  let accepted = 0;
  for (const probe of probes) {
    for (const mxHost of mxHosts.slice(0, 2)) {
      const result = await probeRcpt(mxHost, probe, 8000);
      if (result === "accepted") {
        accepted += 1;
        break;
      }
    }
  }
  return accepted >= 2;
}

export interface PatternVerifyResult {
  email: string;
  result: SmtpProbeResult;
}

export async function verifyEmailPatterns(
  emails: string[],
  domain: string,
): Promise<{
  best: PatternVerifyResult | null;
  catchAll: boolean;
  smtpAvailable: boolean;
  results: PatternVerifyResult[];
}> {
  const mxHosts = await resolveMxHosts(domain);
  if (mxHosts.length === 0) {
    setSmtpCapability("unavailable");
    return {
      best: null,
      catchAll: false,
      smtpAvailable: false,
      results: emails.map((email) => ({ email, result: "unknown" as const })),
    };
  }

  const catchAll = await isCatchAllDomain(domain);
  if (catchAll) {
    setSmtpCapability("available");
    return {
      best: emails[0] ? { email: emails[0], result: "unknown" } : null,
      catchAll: true,
      smtpAvailable: true,
      results: emails.map((email) => ({ email, result: "unknown" as const })),
    };
  }

  const results: PatternVerifyResult[] = [];
  let sawResponse = false;

  for (const email of emails) {
    let result: SmtpProbeResult = "unknown";
    for (const mxHost of mxHosts.slice(0, 2)) {
      const probe = await probeRcpt(mxHost, email, 8000);
      if (probe !== "unknown") {
        sawResponse = true;
      }
      if (probe === "accepted") {
        result = "accepted";
        break;
      }
      if (probe === "rejected") {
        result = "rejected";
      }
    }
    results.push({ email, result });
    if (result === "accepted") break;
  }

  if (!sawResponse) {
    setSmtpCapability("unavailable");
  } else {
    setSmtpCapability("available");
  }

  const accepted = results.find((item) => item.result === "accepted");
  return {
    best: accepted ?? null,
    catchAll: false,
    smtpAvailable: sawResponse,
    results,
  };
}
