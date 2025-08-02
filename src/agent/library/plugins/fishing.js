import Vec3 from 'vec3';

function createTask() {
    const task = {
        done: false
    }
    task.promise = new Promise((resolve, reject) => {
        task.cancel = (err) => {
            if (!task.done) {
                task.done = true;
                reject(err);
            }
        }
        task.finish = (result) => {
            if (!task.done) {
                task.done = true;
                resolve(result);
            }
        }
    });
    return task;
}

function createDoneTask() {
    const task = {
        done: true,
        promise: Promise.resolve(),
        cancel: () => { },
        finish: () => { }
    };
    return task;
}

export function plugin(bot) {
    let bobberId = 90;
    // Before 1.14 the bobber entity keep changing name at each version (but the id stays 90)
    // 1.14 changes the id, but hopefully we can stick with the name: fishing_bobber
    // the alternative would be to rename it in all version of mcData
    if (bot.supportFeature('fishingBobberCorrectlyNamed')) {
        bobberId = bot.registry.entitiesByName.fishing_bobber.id;
    }

    let fishingTask = createDoneTask();
    let lastBobber = null;
    let lastBobberPos = null;

    bot._client.on('spawn_entity', (packet) => {
        if (packet.type === bobberId && !fishingTask.done && !lastBobber) {
            lastBobber = bot.entities[packet.entityId];
        }
    });

    bot._client.on('world_particles', async (packet) => {
        if (!lastBobber || fishingTask.done) return;

        const pos = lastBobber.position;
        const parts = bot.registry.particlesByName;

        if (!lastBobberPos || lastBobberPos.distanceTo(pos) > 0.1) {
            lastBobberPos = pos;
            await bot.lookAt(pos);
        }

        if (packet.particleId === (parts?.fishing ?? parts.bubble).id && packet.particles === 6 && pos.distanceTo(new Vec3(packet.x, pos.y, packet.z)) <= 1.23) {
            bot.activateItem();
            lastBobber = null;
            lastBobberPos = null;
            fishingTask.finish();
        }
    });

    bot._client.on('entity_destroy', (packet) => {
        if (!lastBobber) return;
        if (packet.entityIds.some(id => id === lastBobber.id)) {
            lastBobber = null;
            lastBobberPos = null;
            fishingTask.cancel(new Error('Fishing cancelled'));
        }
    });

    async function fish() {
        if (!fishingTask.done) {
            fishingTask.cancel(new Error('Fishing cancelled due to calling bot.fish() again'));
        }

        fishingTask = createTask()

        bot.activateItem()

        await fishingTask.promise
    }

    function cancelTask() {
        if (!lastBobber || fishingTask.done) return;
        bot.activateItem();
        lastBobber = null;
        lastBobberPos = null;
        fishingTask.finish();
        // fishingTask.cancel(new Error('Fishing cancelled'))
    }

    bot.fish = fish;
    bot.fish.cancelTask = cancelTask;
}
