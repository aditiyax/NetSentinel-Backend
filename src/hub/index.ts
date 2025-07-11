import express from 'express';
import http from 'http';
import { Server, Socket } from 'socket.io';
import { v4 as uuidv4 } from 'uuid';
import { prisma } from '../db/src/index';
import type { IncomingMessage, SignupIncomingMessage } from "../utils/messges";
import { PublicKey } from "@solana/web3.js";
import nacl from "tweetnacl";
import nacl_util from "tweetnacl-util";

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
  }
});

console.log("🚀 Hub Server starting on port 8081...");

const availableValidators: {
  validatorId: string;
  socket: Socket;
  publicKey: string;
}[] = [];

const CALLBACKS: { [callbackId: string]: (data: IncomingMessage) => void } = {};
const COST_PER_VALIDATION = 100;

// SOCKET.IO SETUP
io.on('connection', (socket: Socket) => {
  console.log("🔗 New WebSocket connection");

  socket.on('message', async (message: string) => {
    const data: IncomingMessage = JSON.parse(message);

    if (data.type === 'signup') {
      console.log(`📨 Received signup from IP: ${data.data.ip}, publicKey: ${data.data.publicKey}`);

      const verified = await verifyMessage(
        `Signed message for ${data.data.callbackId}, ${data.data.publicKey}`,
        data.data.publicKey,
        data.data.signedMessage
      );

      if (verified) {
        console.log("✅ Signup message verified successfully.");
        await signupHandler(socket, data.data);
      } else {
        console.warn("⚠️ Signup message verification failed.");
      }

    } else if (data.type === 'validate') {
      console.log(`📩 Received validation result for callbackId: ${data.data.callbackId}`);
      CALLBACKS[data.data.callbackId]?.(data);
      delete CALLBACKS[data.data.callbackId];
    }
  });

  socket.on('disconnect', () => {
    const i = availableValidators.findIndex(v => v.socket.id === socket.id);
    if (i !== -1) {
      const removed = availableValidators.splice(i, 1);
      console.log(`🔌 Validator ${removed[0]?.validatorId} disconnected.`);
    }
  });
});

// SIGNUP HANDLER
async function signupHandler(socket: Socket, { ip, publicKey, signedMessage, callbackId }: SignupIncomingMessage) {
  let validatorDb = await prisma.validator.findFirst({ where: { publicKey } });

  if (validatorDb) {
    console.log(`👤 Validator already exists: ${validatorDb.id}`);
  } else {
    validatorDb = await prisma.validator.create({
      data: {
        ip,
        publicKey,
        location: 'unknown',
      },
    });
    console.log(`🆕 Registered new validator: ${validatorDb.id}`);
  }

  socket.send(JSON.stringify({
    type: 'signup',
    data: {
      validatorId: validatorDb.id,
      callbackId,
    },
  }));

  availableValidators.push({
    validatorId: validatorDb.id,
    socket,
    publicKey: validatorDb.publicKey,
  });

  console.log(`🤝 Validator ${validatorDb.id} added to active pool.`);
}

// VERIFY MESSAGE
async function verifyMessage(message: string, publicKey: string, signature: string) {
  try {
    const messageBytes = nacl_util.decodeUTF8(message);
    return nacl.sign.detached.verify(
      messageBytes,
      new Uint8Array(JSON.parse(signature)),
      new PublicKey(publicKey).toBytes()
    );
  } catch (error) {
    console.error("❌ Error during message verification:", error);
    return false;
  }
}

// PERIODIC TASK
setInterval(async () => {
  console.log("⏱️ Running periodic validation check...");

  const websitesToMonitor = await prisma.website.findMany({
    where: { disabled: false },
  });

  console.log(`🌐 Found ${websitesToMonitor.length} websites to validate.`);

  for (const website of websitesToMonitor) {
    availableValidators.forEach(validator => {
      const callbackId = uuidv4();
      console.log(`📤 Sending validation request for ${website.url} to Validator ${validator.validatorId}`);

      validator.socket.send(JSON.stringify({
        type: 'validate',
        data: {
          url: website.url,
          callbackId,
          websiteId: website.id,
        },
      }));

      CALLBACKS[callbackId] = async (data: IncomingMessage) => {
        if (data.type === 'validate') {
          const { validatorId, status, latency, signedMessage } = data.data;

          const verified = await verifyMessage(
            `Replying to ${callbackId}`,
            validator.publicKey,
            signedMessage
          );

          if (!verified) {
            console.warn(`⚠️ Signature verification failed for Validator ${validatorId}`);
            return;
          }

          if (!validatorId) {
            console.error(`❌ validatorId is null or undefined for callbackId: ${callbackId}`);
            return;
          }

          console.log(`✅ Validation verified. Logging tick for ${website.url}`);

          await prisma.$transaction(async (tx) => {
            await tx.websiteTick.create({
              data: {
                websiteId: website.id,
                validatorId: validatorId,
                status,
                latency,
                createdAt: new Date(),
              },
            });

            await tx.validator.update({
              where: { id: validatorId },
              data: {
                pendingPayouts: { increment: COST_PER_VALIDATION },
              },
            });

            console.log(`💾 Stored tick and updated payouts for Validator ${validatorId}`);
          });
        }
      };
    });
  }
}, 20 * 1000);

// START SERVER
server.listen(8081, () => {
  console.log("✅ Server listening on port 8081");
});
