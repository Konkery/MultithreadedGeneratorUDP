import { createSocket } from 'dgram';
import { cpus } from 'os'; 
// import CircularAverageBuffer from './CircularBuffer';
const TOTAL_BUFFER_SIZE = 1_073_741_824; // 1GB in bytes
const propotion = (x, in_min, in_max, out_min, out_max) => {
    return (x - in_min) * (out_max - out_min) / (in_max - in_min) + out_min;
}
const wait = (ms=0) => new Promise((res, rej) => setTimeout(res, ms));

class Sender {
    clients = null;
    constructor(workerData) {
        this.workerData = workerData;
        // this.latencyBuffer = new CircularAverageBuffer(10);
        // Привязка потока к ядру ЦП
        // this.BindCPU(threadIndex);
    }
    async Run({ targetSpeed, isMaxSpeed }) {
        await this.Init()
        return (isMaxSpeed) ? this.RunMaxSpeed() : this.RunFixedSpeed({ targetSpeed });
    }
    async Init() {
        const {
            serverAddress,
            sockets: socketsInfo,
            isMaxSpeed,
            targetSpeed,
            threadIndex,
            packetSize
        } = this.workerData;
        // this.InitSysChannel(workerData)
        await this.InitClient(socketsInfo, serverAddress);
    }

    BindCPU(threadIndex) {
        try {
            const cpuId = threadIndex % cpus().length;
            process.cpuUsage();
            process.env.UV_THREADPOOL_SIZE = 1;
            if (process.setAffinity) {
                process.setAffinity([cpuId]);
            }
        } catch (e) {
            console.error(`[Thread ${threadIndex}] CPU binding failed:`, e.message);
        }
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

            const send = async() => new Promise((res, rej) => {
                // Упаковываем заголовок и счетчик
                buffer[0] = HEADER_VALUE;
                buffer.writeUInt32BE(packetCounter++, 1); // 8 байт после заголовка (BE = Big Endian)

                // let t1 = performance.now();
                socket.send(buffer, port, serverAddress, (e) => {
                    // this.latencyBuffer.push(performance.now()-t1);
                    return e ? rej(e) : res();
                });
            });
            return { socket, port, buffer, send, packetSize, socketIndex };
        });
        return Promise.all(this.clients.map(({ socket }, i) => {
            socket.bind(socketsInfo[i].port, () => {
                socket.setSendBufferSize(socketsInfo[i].bufferSize);
            });
        }));
    }

    async RunMaxSpeed() {
        const K = 0.95;  // какой процент от очереди мы готовы забить сообщениями
        this.sent = Array(this.clients.length).fill(0);

        let interval = setInterval(() => {
            if (this.stopFlag) clearInterval(interval);
            if (this.sent) console.log(`${JSON.stringify(this.sent)} -> ${this.sent.reduce((c, p)=>c+p, 0)}`);
            // this.SendMetaMsg(sent);
        }, 1000);

        for (let i = 0; i < this.clients.length; i++) {
            const socketBufferSize = this.clients[i].socket.getSendBufferSize();
            let packetsToSend = Math.floor(socketBufferSize / this.clients[i].packetSize);
            // let queueSize = this.clients[i].socket.getSendQueueCount();
            // const socketBufferLoad = propotion(queueSize, 0, socketBufferSize*K, 0, 1);
            // packetsToSend = Math.floor(packetsToSend * (1 - socketBufferLoad));
            while (--packetsToSend > 0 && !this.stopFlag) {
                await this.clients[i].send();
                let q = this.clients[i].socket.getSendQueueSize();
                if (q > 0) console.log(q);
                this.sent[i] += 1;
            }
            if (i == this.clients.length-1) i = -1;
            // this.ConsoleShow(JSON.stringify(this.clients.map(({ socket }) => socket.getSendQueueSize())));
            if (this.stopFlag) break;
        }
        this.GracefulShutDown();
    }
    async RunFixedSpeed({ targetSpeed }) {
        this.sent = Array(this.clients.length).fill(0);
        const period = 200;
        for (let i = 0; i < this.clients.length; i++) {
            if (this.stopFlag) break;
            let t1 = performance.now();
            let packetsToSend = targetSpeed / this.clients.length;
            while (packetsToSend-- > 0 && !this.stopFlag && performance.now() - t1 < period) {
                await this.clients[i].send();
                this.sent[i] += 1;
            }

            if (i == this.clients.length-1) {
                i = -1;
                // console.log(`${JSON.stringify(this.sent)} -> ${this.sent.reduce((c, p)=>c+p, 0)}`);
            }
        }
        this.GracefulShutDown();
    }
    SendMetaMsg(data) {
        this.sysChannel?.write(JSON.stringify({ timestamp: performance.now(), data }));
    }
    ConsoleShow(stdout) {
        process.stdout.write(`\r${stdout}`); // \r возвращает каретку в начало строки
    }
    StartGracefulShutDown() {
        this.stopFlag = true;
    }
    GracefulShutDown() {
        console.log(`Shutdown`);
        this.clients?.forEach(({ socket }) => {
            socket.close();
        });
        
        console.log(`Sent from each socket:\n${JSON.stringify(this.sent)}\nTotal: ${this.sent?.reduce((c, p)=>c+p, 0)}`);
    }
}

export default Sender;