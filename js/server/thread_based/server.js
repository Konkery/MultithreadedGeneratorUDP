const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');
const dgram = require('dgram');
const os = require('os');
const minimist = require('minimist');

// Конфигурация по умолчанию
const DEFAULT_PORT_BASE = 40000;
const DEFAULT_PACKET_SIZE = 8192; // 8KB
const STATS_INTERVAL = 1000; // 1 секунда

if (isMainThread) {
    // Парсинг аргументов командной строки
    const args = minimist(process.argv.slice(2), {
        alias: {
            p: 'portBase',
            s: 'sockets',
            z: 'packetSize'
        },
        default: {
            portBase: DEFAULT_PORT_BASE,
            packetSize: DEFAULT_PACKET_SIZE,
            sockets: 1
        }
    });

    const numSockets = parseInt(args.sockets);
    const portBase = parseInt(args.portBase);
    const packetSize = parseInt(args.packetSize);

    if (isNaN(numSockets)) throw new Error('Invalid sockets count');
    if (isNaN(portBase)) throw new Error('Invalid port base');
    if (isNaN(packetSize)) throw new Error('Invalid packet size');

    // Создаем рабочие потоки (1 поток = 1 порт)
    const workers = [];
    const stats = Array(numSockets).fill(0);
    const missed = Array(numSockets).fill(0);
    let lastPrintTime = Date.now();
    let overall = 0;
    let overallMissed = 0;

    // Статистика
    setInterval(() => {
        const now = Date.now();
        const elapsed = (now - lastPrintTime) / 1000;
        const totalPackets = stats.reduce((sum, val) => sum + val, 0);
        const packetsLost = missed.reduce((sum, val) => sum + val, 0);
        const speed = (totalPackets * packetSize * 8) / (elapsed * 1e9); // Gbit/s
        overall += totalPackets;
        overallMissed += packetsLost;
        
        console.log(`[SERVER] Speed: ${speed.toFixed(2)} Gbit/s | `
            + `Received: ${overall.toLocaleString()} | Lost: ${overallMissed.toLocaleString()} (${((overallMissed/overall)*100).toFixed(2)}%)| `
            + `Total: ${(overall+overallMissed).toLocaleString()}`);
        
        lastPrintTime = now;
    }, STATS_INTERVAL);

    // Запуск воркеров
    for (let i = 0; i < numSockets; i++) {
        const worker = new Worker(__filename, {
            workerData: {
                port: portBase + i,
                packetSize,
                workerIndex: i
            }
        });

        worker.on('message', msg => {
            if (msg.type === 'stats') {
                stats[msg.workerIndex] = msg.packets;
                missed[msg.workerIndex] = msg.missed;
            }
        });

        workers.push(worker);
    }

    console.log(`Server started with ${numSockets} sockets (ports ${portBase}-${portBase + numSockets - 1})`);
} else {
    // Код для рабочего потока
    const { port, packetSize, workerIndex } = workerData;
    try {
        const cpuId = workerIndex % os.cpus().length;
        process.cpuUsage();
        process.env.UV_THREADPOOL_SIZE = 1;
        if (process.setAffinity) {
            process.setAffinity([cpuId]);
        }
    } catch (e) {
        console.error(`[Thread ${workerIndex}] CPU binding failed:`, e.message);
    }

    const socket = dgram.createSocket('udp4');
    let packetsReceived = 0;
    let socketCounter = 0;
    let LastPacketIndex = 0;

    socket.on('message', msg => {
        if (msg.length === packetSize) {            
            packetsReceived++;
            LastPacketIndex = msg.readUint32BE(1) + 1;
            socketCounter++;
        }
    });

    socket.on('listening', () => {
        const address = socket.address();
        console.log(`[Worker ${workerIndex}] Listening on ${address.address}:${address.port}`);
    });

    socket.bind(port);

    // Отправка статистики
    setInterval(() => {
        parentPort.postMessage({
            type: 'stats',
            workerIndex,
            packets: packetsReceived,
            missed: (LastPacketIndex - socketCounter)
        });
        packetsReceived = 0;
        socketCounter = LastPacketIndex;
    }, STATS_INTERVAL);
}