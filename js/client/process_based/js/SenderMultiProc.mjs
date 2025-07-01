import os, { cpus } from 'os';
import Sender from './Sender.mjs';
import { argv } from 'process';
import { execSync } from 'child_process';

const [path, fn, args] = argv;
let workerData = JSON.parse(args);

const sender = new Sender(workerData);
process.on('message', (msg) => {
    console.log(msg);
    if (msg.type === 'SIGINT') {
        sender.StartGracefulShutDown();
    }
});

// Привязка к CPU-ядру через taskset (Linux)
if (os.type() == 'Linux') {
    const { pid } = process;
    let i = workerData.threadIndex;
    let { baseCPUIndex } = workerData;
    const cpu = baseCPUIndex + (i % cpus().length);
    execSync(`taskset -cp ${cpu} ${pid}`);
    console.log(`Process ${process.pid} running on Core ${cpu}`);
}

await sender.Init();
sender.RunFixedSpeed(workerData);
