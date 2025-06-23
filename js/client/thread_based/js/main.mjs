import minimist from 'minimist';
import Sender from './Sender.mjs';
import { Worker } from 'worker_threads';

// Конфигурация по умолчанию
const TOTAL_BUFFER_SIZE = 1_073_741_824; // 1GB in bytes
const DEFAULT_PORT_BASE = 40000;
const DEFAULT_PACKET_SIZE = 8192; // 8KB
const DEFAULT_SPEED = 10; // Gbit/s
const DEFAULT_MODE = 'sthread';
const MODE_MULTITHREAD = 'mthread';


// Парсинг аргументов
const args = minimist(process.argv.slice(2), {
    alias: {
        s: 'server',
        p: 'portBase',
        z: 'packetSize',
        c: 'sockets',
        r: 'speed',
        m: 'mode'
    },
    default: {
        portBase: DEFAULT_PORT_BASE,
        packetSize: DEFAULT_PACKET_SIZE,
        sockets: 1,
        speed: DEFAULT_SPEED,
        mode: DEFAULT_MODE
    }
});

const serverAddress = args.server;
const numSockets = parseInt(args.sockets);
const portBase = parseInt(args.portBase);
const packetSize = parseInt(args.packetSize);
const isMaxSpeed = args.max;
const targetSpeed = isMaxSpeed ? 0 : parseFloat(args.speed);
const mode = args.mode;

if (!serverAddress) throw new Error('Server address required');
if (isNaN(numSockets)) throw new Error('Invalid sockets count');
if (isNaN(portBase)) throw new Error('Invalid port base');
if (isNaN(packetSize)) throw new Error('Invalid packet size');
if (!isMaxSpeed && isNaN(targetSpeed)) throw new Error('Invalid speed');

console.log(`Starting client with:
- Server: ${serverAddress}
- Sockets: ${numSockets}
- Mode: ${isMaxSpeed ? 'MAX SPEED' : targetSpeed + ' Packets/s'}
- Packet size: ${(packetSize / 1024).toFixed(2)} KB`);
const socketInfoList = Array(numSockets).fill().map((_, i) => ({
    port: portBase + i,
    packetSize,
    socketIndex: i,
    bufferSize: Math.floor(TOTAL_BUFFER_SIZE / numSockets)
}));
if (mode == DEFAULT_MODE) {

    const sender = new Sender({
        serverAddress,
        sockets: socketInfoList,
        isMaxSpeed,
        targetSpeed,
        threadIndex: 0,
        packetSize
    });
    process.on('SIGINT', () => {
        sender.StartGracefulShutDown();
    });
    sender.Run({ targetSpeed, isMaxSpeed });


} else if (mode == MODE_MULTITHREAD) {
    const workers = [];
    for (let i = 0; i < numSockets; i++) {
        if ((i + 1) % 2 == 0 || i == numSockets - 1) {
            workers.push(new Worker('./SenderMultiThreadWrapper.mjs', {
                workerData: {
                    serverAddress,
                    sockets: socketInfoList.splice(0, 2),
                    isMaxSpeed,
                    targetSpeed,
                    threadIndex: Math.ceil((i + 1) / 2),
                    packetSize
                }
            }));
        }
    }
}