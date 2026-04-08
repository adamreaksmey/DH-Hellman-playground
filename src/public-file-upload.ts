import axios, { type AxiosError } from "axios";
import FormData from "form-data";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { decryptJWT } from "./util.js";

type InitiateResp = {
  id: string;
  url: string;
  formData: Record<string, string>;
  file: string; // file field name
  header?: Record<string, string>;
  successCodes?: number[];
  expires?: number;
};

type UserDecryptedResp = {
  raw: string;
  header: { alg: string; typ: "JWT" };
  payload: {
    UserID: string;
    PlatformID: number;
    exp: number;
    iat: number;
  };
  signature: string;
};

type CompleteResp = {
  url: string;
};

const CHAT_API_BASE = "http://localhost:10008"; // <-- your chat-api base
const GROUP = "chat"; // tag/group
const FILE_PATH = path.resolve(process.cwd(), "src", "test.jpg"); // <-- file to upload
// For JPEG, prefer image/jpeg (image/jpg is non-standard but often accepted)
const CONTENT_TYPE = "image/jpeg";
const TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJVc2VySUQiOiI3ODMyMDA3MzI3IiwiUGxhdGZvcm1JRCI6NSwiZXhwIjoxNzgyNzE2MjQ2LCJpYXQiOjE3NzQ5NDAyNDF9.o4-Fo54tEqT29tp1mggcDqlLNAJQHNqoMKgHaRGP-Bo";

function buildProtectedHeaders(
  method: "POST",
  apiPath: string,
  body: unknown,
): Record<string, string> {

  return {
    "token": TOKEN
  };
}

async function httpPostJson<T>(url: string, body: any): Promise<T> {
  try {
    const endpoint = new URL(url).pathname;
    const protectedHeaders = buildProtectedHeaders("POST", endpoint, body);

    const res = await axios.post<T>(url, body, {
      headers: {
        "Content-Type": "application/json",
        operationID: randomUUID(),
        ...protectedHeaders,
      },
      // some OpenIM gateways return non-2xx with useful body; surface it below
      validateStatus: () => true,
    });

    if (res.status < 200 || res.status >= 300) {
      throw new Error(
        `HTTP ${res.status}\n${
          typeof res.data === "string" ? res.data : JSON.stringify(res.data)
        }`,
      );
    }

    return res.data;
  } catch (e) {
    const err = e as AxiosError;
    if (err.response) {
      throw new Error(
        `HTTP ${err.response.status}\n${
          typeof err.response.data === "string"
            ? err.response.data
            : JSON.stringify(err.response.data)
        }`,
      );
    }
    throw e;
  }
}

async function uploadToS3Form(
  initiate: InitiateResp,
  filePath: string,
  contentType: string,
) {
  const fd = new FormData();

  // OpenIM returns fields that MUST be included exactly.
  for (const [k, v] of Object.entries(initiate.formData ?? {})) {
    fd.append(k, v);
  }

  // Attach the file under the dynamic field name returned by OpenIM.
  const fileName = path.basename(filePath);
  fd.append(initiate.file, createReadStream(filePath), {
    filename: fileName,
    contentType,
  });

  const res = await axios.post(initiate.url, fd, {
    headers: {
      ...fd.getHeaders(),
      ...(initiate.header ?? {}),
    },
    maxBodyLength: Infinity,
    maxContentLength: Infinity,
    validateStatus: () => true,
  });

  const okCodes = new Set<number>([
    200,
    201,
    204,
    ...((initiate.successCodes ?? []) as number[]),
  ]);

  const respText =
    typeof res.data === "string" ? res.data : JSON.stringify(res.data);
  if (!okCodes.has(res.status)) {
    throw new Error(`S3 upload failed: HTTP ${res.status}\n${respText}`);
  }

  return { status: res.status, body: respText };
}

async function main() {
  const s = await stat(FILE_PATH);

  const decodedJWT = decryptJWT(TOKEN);
  const USER_ID = decodedJWT.payload.UserID;

  if (!USER_ID) throw new Error("User ID not found");

  // 1) Initiate (your chat service proxies to OpenIM)
  const initiate = await httpPostJson<any>(
    `${CHAT_API_BASE}/object/public/initiate_form_data`,
    {
      token: TOKEN,
      name: `${USER_ID}/${path.basename(FILE_PATH)}`,
      size: s.size,
      contentType: CONTENT_TYPE,
      group: GROUP,
      platform: 5
    },
  );

  // Depending on your API response wrapper, the object might be directly returned
  // or nested (e.g. { errCode, data }). If you see nesting, adjust here.
  const init: InitiateResp = initiate.data ?? initiate;
    console.log("show init", init);

  console.log("Initiate OK:", {
    id: init.id,
    url: init.url,
    fileField: init.file,
    formDataKeys: Object.keys(init.formData ?? {}),
  });

  // 2) Upload bytes directly to MinIO/S3
  const uploadRes = await uploadToS3Form(init, FILE_PATH, CONTENT_TYPE);
  console.log("Upload OK:", uploadRes.status);

  // 3) Complete (register object + get canonical OpenIM URL)
  const complete = await httpPostJson<any>(
    `${CHAT_API_BASE}/object/public/complete_form_data`,
    {
      token: TOKEN,
      id: init.id,
      name: path.basename(FILE_PATH),
      platform: 5
    },
  );

  const done: CompleteResp = complete.data ?? complete;
  console.log("Complete OK. OpenIM URL:", done.url);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
