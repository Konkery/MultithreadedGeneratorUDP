const CalculateTiming = (iterationsPerSecond) => {
    const MIN_PERIOD = 0.1; // Минимальный допустимый период в миллисекундах
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

console.log(CalculateTiming(81920 ));