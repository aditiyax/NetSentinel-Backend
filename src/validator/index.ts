import * as path from "path";
import * as dotenv from "dotenv";
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

import { io } from "socket.io-client";
import { v4 as uuidv4 } from 'uuid';
import { Keypair } from "@solana/web3.js";
import nacl from "tweetnacl";
import nacl_util from "tweetnacl-util";
import type { OutgoingMessage, SignupOutgoingMessage, ValidateOutgoingMessage } from "../utils/messges";

console.log("🔧 Validator service starting...");


//@ts-ignore
const pkRaw: string = process.env.PRIVATE_KEY;
if (!pkRaw) {
  throw new Error("❌ PRIVATE_KEY is not defined in .env");
}

let validatorId: string | null = null;
const CALLBACKS: { [callbackId: string]: (data: SignupOutgoingMessage) => void } = {};
const pendingValidations: ValidateOutgoingMessage[] = [];

async function main() {
  console.log("🔑 Loading keypair...");
  const keypair = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(pkRaw))
  );

  console.log("🌐 Connecting to Hub Socket.IO server on ws://localhost:8081");
  const socket = io("ws://hub:8081");


  socket.on('connect', async () => {
    const callbackId = uuidv4();
    CALLBACKS[callbackId] = (data: SignupOutgoingMessage) => {
      // Already handled in message handler
    };

    console.log("📡 Connected to hub. Sending signup message...");
    const signedMessage = await signMessage(
      `Signed message for ${callbackId}, ${keypair.publicKey}`,
      keypair
    );

    socket.send(JSON.stringify({
      type: 'signup',
      data: {
        callbackId,
        ip: '127.0.0.1',
        publicKey: keypair.publicKey.toBase58(),
        signedMessage,
      },
    }));
  });

  socket.on('message', async (rawData: string) => {
    const data: OutgoingMessage = JSON.parse(rawData);

    if (data.type === 'signup') {
      console.log("✅ Received signup response from hub");
      CALLBACKS[data.data.callback]?.(data.data);
      delete CALLBACKS[data.data.callback];

      validatorId = data.data.validatorId;
      console.log(`🆔 Validator registered with ID: ${validatorId}`);

      while (pendingValidations.length > 0) {
        const pending = pendingValidations.shift();
        if (pending) await validateHandler(socket, pending, keypair);
      }

    } else if (data.type === 'validate') {
      if (!validatorId) {
        console.warn(`⚠️ Queuing validate request (callbackId: ${data.data.callbackId})`);
        pendingValidations.push(data.data);
      } else {
        await validateHandler(socket, data.data, keypair);
      }
    }
  });

  socket.on('connect_error', (err) => {
    console.error("❌ Socket connection error:", err.message);
  });

  socket.on('disconnect', () => {
    console.warn("⚠️ Disconnected from hub");
  });
}

async function validateHandler(socket: any, { url, callbackId, websiteId }: ValidateOutgoingMessage, keypair: Keypair) {
  if (!validatorId) {
    console.error(`❌ validatorId not set for callbackId: ${callbackId}`);
    return;
  }

  console.log(`🔍 Validating URL: ${url}`);
  const startTime = Date.now();
  const signature = await signMessage(`Replying to ${callbackId}`, keypair);

  try {
    const response = await fetch(url);
    const endTime = Date.now();
    const latency = endTime - startTime;
    const status = response.status;

    console.log(`📥 ${url} responded with ${status} in ${latency}ms`);

    socket.send(JSON.stringify({
      type: 'validate',
      data: {
        callbackId,
        status: status === 200 ? 'Good' : 'Bad',
        latency,
        websiteId,
        validatorId,
        signedMessage: signature,
      },
    }));
  } catch (error) {
    console.error(`❌ Error validating ${url}:`, error);

    socket.send(JSON.stringify({
      type: 'validate',
      data: {
        callbackId,
        status: 'Bad',
        latency: 1000,
        websiteId,
        validatorId,
        signedMessage: signature,
      },
    }));
  }
}

async function signMessage(message: string, keypair: Keypair) {
  const messageBytes = nacl_util.decodeUTF8(message);
  const signature = nacl.sign.detached(messageBytes, keypair.secretKey);
  return JSON.stringify(Array.from(signature));
}

main();
