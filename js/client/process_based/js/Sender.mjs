import { createSocket } from 'dgram';
import { performance } from 'node:perf_hooks';

const propotion = (x, in_min, in_max, out_min, out_max) => {
    return (x - in_min) * (out_max - out_min) / (in_max - in_min) + out_min;
}

class Sender {
    clients = null;
    constructor(workerData) {
        this.workerData = workerData;
    }
    async Run({ targetSpeed, isMaxSpeed }) {
        await this.Init()
        return (isMaxSpeed) ? this.RunMaxSpeed() : this.RunFixedSpeed({ targetSpeed });
    }
    async Init() {
        const { serverAddress, sockets: socketsInfo } = this.workerData;
        await this.InitClient(socketsInfo, serverAddress);
    }

    InitSysChannel({ serverAddress, tcpPort }) {
        try {
            require('net').createConnection({ host: serverAddress, port: tcpPort }, (_socket) => {
                this.sysChannel = _socket;
            });
        } catch {

        }
    }

    async InitClient(socketsInfo, serverAddress) {
        this.clients = socketsInfo.map((socketInfo, i) => {
            const { portBase, packetSize, socketIndex, port, bufferSize } = socketInfo;
            const socket = createSocket('udp4');

            const buffer = Buffer.alloc(packetSize);

            // Генерация случайных данных (кроме первых 8 байт)
            for (let i = 8; i < packetSize; i++) {
                buffer[i] = Math.floor(Math.random() * 256);
            }

            let packetCounter = 0;
            const HEADER_VALUE = i;
            let c = 0;
            let t1 = performance.now();
            let deltaAvg = 0;

            const send = () => {
                // Упаковываем заголовок и счетчик
                buffer[0] = HEADER_VALUE;
                buffer.writeUInt32BE(packetCounter++, 1); // 8 байт после заголовка (BE = Big Endian)

                socket.send(buffer, portBase, serverAddress);

                /* DEBUG */
                let t2 = performance.now();
                deltaAvg += t2 - t1;
                t1 = t2;
                if (c++ % 100000 == 0) {
                    console.log(`[INFO] Average delay is ${(deltaAvg / c).toFixed(4)} ms`);
                }
                /******  */
            };
            return { socket, port, buffer, send, packetSize, socketIndex };
        });
        return Promise.all(this.clients.map(({ socket }, i) => {
            socket.bind(socketsInfo[i].port, () => {
                console.log(socketsInfo[i].bufferSize);
                socket.setSendBufferSize(socketsInfo[i].bufferSize);
            });
        }));
    }

    async *ThrottledIndexGen(delayMs, timeoutMs) {
        while (!this.stopFlag) {
            const t1 = performance.now();
            yield 0;
            // let c = 0;
            while (performance.now() - t1 < delayMs) {
                // c++;
                await new Promise(resolve => setImmediate(resolve));
            }
            // console.log(c);
        }
    }

    /**
     * Рассчитывает период между вызовами и количество операций за итерацию
     * @param {number} iterationsPerSecond - Количество итераций в секунду
     * @returns {Object} { period: number, k: number }
     */
    CalculateTiming(iterationsPerSecond) {
        const MIN_PERIOD = 0.01; // Минимальный допустимый период в миллисекундах
        const MULTIPLIER = 10;   // Во сколько раз увеличиваем период при агрегации

        // Базовый расчет периода
        let period = 1000 / iterationsPerSecond;
        let k = 1;

        // Если период слишком мал, увеличиваем его и вычисляем k
        if (period < MIN_PERIOD) {
            const ratio = MIN_PERIOD / period;
            k = Math.ceil(ratio / MULTIPLIER) * MULTIPLIER;
            period = (1000 / iterationsPerSecond) * k;
        }

        return { period, k };
    }

    async RunFixedSpeed({ targetSpeed }) {
        let { period, k } = this.CalculateTiming(targetSpeed);
        console.log(`[INFO] Send ${targetSpeed * k} packets with period ${period.toFixed(4)} ms`);

        for await (let i of this.ThrottledIndexGen(period)) {
            for (let j = 0; j < k; j++) {
                this.clients[i].send();
            }
        }
        console.log('done');
        this.GracefulShutDown();
    }

    async RunMaxSpeed() {
        const period = 0.01;
        const k = 1;
        
        for await (let i of this.ThrottledIndexGen(period)) {
            for (let j = 0; j < k; j++) {
                this.clients[i].send();
            }
        }
        console.log('done');
        this.GracefulShutDown();
    }

    SendMetaMsg(data) {
        this.sysChannel?.write(JSON.stringify({ timestamp: performance.now(), data }));
    }
    ConsoleShow(stdout) {
        process.stdout.write(`\r${stdout}`); // \r возвращает каретку в начало строки
    }
    StartGracefulShutDown() {
        console.log(`Start shutdown`);
        this.stopFlag = true;
    }
    GracefulShutDown() {
        console.log(`Shutdown`);
        this.clients?.forEach(({ socket }) => {
            socket.close();
        });

        console.log(`Sent from each socket:\n${JSON.stringify(this.sent)}\nTotal: ${this.sent?.reduce((c, p) => c + p, 0)}`);
    }
}

export default Sender;