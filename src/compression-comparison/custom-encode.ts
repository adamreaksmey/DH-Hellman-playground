/**
 * Custom binary message packer
 * Wire format version: 1
 *
 * Layout (bytes):
 * [0]      version         uint8
 * [1]      content_type    uint8
 * [2]      status          uint8  (0=sent, 1=delivered, 2=read, 3=failed)
 * [3]      platform        uint8  (0=ios, 1=android, 2=web, 3=desktop)
 * [4]      version major   uint8
 * [5]      version minor   uint8
 * [6]      version patch   uint8
 * [7..10]  timestamp       uint32 BE
 * [11..22] msg_id suffix   12 bytes fixed  (strips "msg_" prefix)
 * [23..31] conv_id suffix   9 bytes fixed  (strips "conv_" prefix)
 * [32..36] sender_id suffix 5 bytes fixed  (strips "user_" prefix)
 * [37..44] device_id suffix 8 bytes fixed  (strips "device_" prefix)
 * [45]     sender_name len uint8
 * [46..N]  sender_name     utf8
 * [N+1..N+2] content len   uint16 BE
 * [N+3..]  content         utf8
 */

const SCHEMA_VERSION = 1;

const STATUS_ENCODE: Record<string, number> = {
  sent: 0,
  delivered: 1,
  read: 2,
  failed: 3,
};

const STATUS_DECODE = ['sent', 'delivered', 'read', 'failed'] as const;

const PLATFORM_ENCODE: Record<string, number> = {
  ios: 0,
  android: 1,
  web: 2,
  desktop: 3,
};

const PLATFORM_DECODE = ['ios', 'android', 'web', 'desktop'] as const;

// ---- ID helpers ----

const ID_PREFIXES = {
  msg: 'msg_',
  conv: 'conv_',
  sender: 'user_',
  device: 'device_',
} as const;

// Suffix lengths after stripping the known prefix.
// These are the wire widths — both encoder and decoder must agree.
// Derive from your actual ID format; these match "msg_abc123def456",
// "conv_789xyz", "user_42069", "device_9876abc".
const ID_SUFFIX_LENGTHS = {
  msg: 12,    // "abc123def456"
  conv: 6,    // "789xyz"
  sender: 5,  // "42069"
  device: 7,  // "9876abc"
} as const;

function stripPrefix(value: string, prefix: string, fixedLen: number): Buffer {
  const suffix = value.startsWith(prefix) ? value.slice(prefix.length) : value;
  if (suffix.length !== fixedLen) {
    throw new Error(
      `ID suffix "${suffix}" has length ${suffix.length}, expected ${fixedLen} (full value: "${value}")`
    );
  }
  return Buffer.from(suffix, 'utf8');
}

// ---- Types ----

export interface ChatMessage {
  msg_id: string;
  conversation_id: string;
  sender_id: string;
  sender_name: string;
  content: string;
  content_type: number;
  timestamp: number;
  status: string;
  metadata: {
    client_version: string;
    platform: string;
    device_id: string;
  };
}

// ---- Encoder ----

export function pack(msg: ChatMessage): Buffer {
  const contentBytes = Buffer.from(msg.content, 'utf8');
  const nameBytes = Buffer.from(msg.sender_name, 'utf8');

  if (nameBytes.length > 255) throw new Error('sender_name exceeds 255 bytes');
  if (contentBytes.length > 65535) throw new Error('content exceeds 65535 bytes');

  const statusByte = STATUS_ENCODE[msg.status];
  if (statusByte === undefined) throw new Error(`Unknown status: "${msg.status}"`);

  const platformByte = PLATFORM_ENCODE[msg.metadata.platform];
  if (platformByte === undefined) throw new Error(`Unknown platform: "${msg.metadata.platform}"`);

  const [maj, min, pat] = msg.metadata.client_version.split('.').map(Number);

  const msgIdBytes    = stripPrefix(msg.msg_id,              ID_PREFIXES.msg,    ID_SUFFIX_LENGTHS.msg);
  const convIdBytes   = stripPrefix(msg.conversation_id,     ID_PREFIXES.conv,   ID_SUFFIX_LENGTHS.conv);
  const senderIdBytes = stripPrefix(msg.sender_id,           ID_PREFIXES.sender, ID_SUFFIX_LENGTHS.sender);
  const deviceIdBytes = stripPrefix(msg.metadata.device_id,  ID_PREFIXES.device, ID_SUFFIX_LENGTHS.device);

  const FIXED = 1 + 1 + 1 + 1 + 3 + 4
    + ID_SUFFIX_LENGTHS.msg + ID_SUFFIX_LENGTHS.conv
    + ID_SUFFIX_LENGTHS.sender + ID_SUFFIX_LENGTHS.device;
  const totalSize = FIXED + 1 + nameBytes.length + 2 + contentBytes.length;
  const buf = Buffer.allocUnsafe(totalSize);
  let o = 0;

  buf.writeUInt8(SCHEMA_VERSION, o);     o += 1;
  buf.writeUInt8(msg.content_type, o);   o += 1;
  buf.writeUInt8(statusByte, o);         o += 1;
  buf.writeUInt8(platformByte, o);       o += 1;
  buf.writeUInt8(maj, o);                o += 1;
  buf.writeUInt8(min, o);                o += 1;
  buf.writeUInt8(pat, o);                o += 1;
  buf.writeUInt32BE(msg.timestamp, o);   o += 4;

  msgIdBytes.copy(buf, o);               o += ID_SUFFIX_LENGTHS.msg;
  convIdBytes.copy(buf, o);              o += ID_SUFFIX_LENGTHS.conv;
  senderIdBytes.copy(buf, o);            o += ID_SUFFIX_LENGTHS.sender;
  deviceIdBytes.copy(buf, o);            o += ID_SUFFIX_LENGTHS.device;

  buf.writeUInt8(nameBytes.length, o);   o += 1;
  nameBytes.copy(buf, o);                o += nameBytes.length;
  buf.writeUInt16BE(contentBytes.length, o); o += 2;
  contentBytes.copy(buf, o);

  return buf;
}

// ---- Decoder ----

export function unpack(buf: Buffer): ChatMessage {
  let o = 0;

  const version = buf.readUInt8(o);      o += 1;
  if (version !== SCHEMA_VERSION) {
    throw new Error(`Unsupported schema version: ${version}`);
  }

  const content_type = buf.readUInt8(o); o += 1;
  const statusByte   = buf.readUInt8(o); o += 1;
  const platformByte = buf.readUInt8(o); o += 1;
  const maj          = buf.readUInt8(o); o += 1;
  const min          = buf.readUInt8(o); o += 1;
  const pat          = buf.readUInt8(o); o += 1;
  const timestamp    = buf.readUInt32BE(o); o += 4;

  const msgIdSuffix    = buf.slice(o, o + ID_SUFFIX_LENGTHS.msg).toString('utf8');    o += ID_SUFFIX_LENGTHS.msg;
  const convIdSuffix   = buf.slice(o, o + ID_SUFFIX_LENGTHS.conv).toString('utf8');   o += ID_SUFFIX_LENGTHS.conv;
  const senderIdSuffix = buf.slice(o, o + ID_SUFFIX_LENGTHS.sender).toString('utf8'); o += ID_SUFFIX_LENGTHS.sender;
  const deviceIdSuffix = buf.slice(o, o + ID_SUFFIX_LENGTHS.device).toString('utf8'); o += ID_SUFFIX_LENGTHS.device;

  const nameLen    = buf.readUInt8(o);   o += 1;
  const senderName = buf.slice(o, o + nameLen).toString('utf8'); o += nameLen;

  const contentLen = buf.readUInt16BE(o); o += 2;
  const content    = buf.slice(o, o + contentLen).toString('utf8');

  const status   = STATUS_DECODE[statusByte];
  const platform = PLATFORM_DECODE[platformByte];

  if (!status)   throw new Error(`Unknown status byte: ${statusByte}`);
  if (!platform) throw new Error(`Unknown platform byte: ${platformByte}`);

  return {
    msg_id:          ID_PREFIXES.msg    + msgIdSuffix,
    conversation_id: ID_PREFIXES.conv   + convIdSuffix,
    sender_id:       ID_PREFIXES.sender + senderIdSuffix,
    sender_name:     senderName,
    content,
    content_type,
    timestamp,
    status,
    metadata: {
      client_version: `${maj}.${min}.${pat}`,
      platform,
      device_id: ID_PREFIXES.device + deviceIdSuffix,
    },
  };
}

// ---- Test harness ----

const jsonData: ChatMessage = {
  msg_id: 'msg_abc123def456',
  conversation_id: 'conv_789xyz',
  sender_id: 'user_42069',
  sender_name: 'alex_chen',
  content: 'Hey, did you see the PR I submitted? Need a review when you get a chance.',
  content_type: 1,
  timestamp: 1742900000,
  status: 'sent',
  metadata: {
    client_version: '3.2.1',
    platform: 'ios',
    device_id: 'device_9876abc',
  },
};

function deepEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function printBuf(label: string, buf: Buffer) {
  const hex = buf.toString('hex').replace(/(.{32})/g, '$1 ').trim();
  console.log(`\n${label} (${buf.length} bytes):`);
  for (const line of hex.split(' ')) {
    const pairs = line.match(/.{2}/g) ?? [];
    console.log('  ' + pairs.join(' '));
  }
}

async function run() {
  const jsonString = JSON.stringify(jsonData, null, 2);
  const jsonSize = Buffer.byteLength(jsonString, 'utf8');

  const packed = pack(jsonData);
  const unpacked = unpack(packed);

  const match = deepEqual(jsonData, unpacked);

  console.log('=== Size comparison ===');
  console.log(`JSON (pretty):   ${jsonSize} bytes`);
  console.log(`JSON (minified): ${Buffer.byteLength(JSON.stringify(jsonData), 'utf8')} bytes`);
  console.log(`Binary packed:   ${packed.length} bytes`);
  console.log(`Reduction:       ${((1 - packed.length / jsonSize) * 100).toFixed(1)}% vs pretty JSON`);
  console.log(`Reduction:       ${((1 - packed.length / Buffer.byteLength(JSON.stringify(jsonData), 'utf8')) * 100).toFixed(1)}% vs minified JSON`);

  console.log('\n=== Round-trip test ===');
  console.log(`Pass: ${match}`);
  if (!match) {
    console.log('Original:', JSON.stringify(jsonData, null, 2));
    console.log('Unpacked:', JSON.stringify(unpacked, null, 2));
  }

  printBuf('Wire bytes', packed);
}

run().catch(console.error);