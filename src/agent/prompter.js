import { mkdirSync, writeFileSync } from 'fs';
import { Examples } from '../utils/examples.js';
import { getCommandDocs } from './commands/index.js';
import { getSkillDocs } from './library/index.js';
import { stringifyTurns } from '../utils/text.js';
import { getCommand } from './commands/index.js';

import { GPT } from '../models/gpt.js';
import { Thought } from './thought.js';
import { MlxLM } from '../models/mlx_lm.js';

export class Prompter {
    constructor(agent) {
        this.agent = agent;
        this.profile = agent.profile
        this.convo_examples = null;
        this.coding_examples = null;

        let name = this.profile.name;
        let chat = this.profile.model;
        let embedding = this.profile.embedding;

        if (embedding == "word_overlap") {
            this.chat_model = new GPT(chat);
            this.embedding_model = null;
        } else {
            const model = new GPT(chat, embedding);
            this.chat_model = model;
            this.embedding_model = model;

            // this.chat_model = new MlxLM(null);
            // this.embedding_model = new GPT(chat, embedding);;
        }

        mkdirSync(`${this.agent.userDataDir}/bots/${name}`, { recursive: true });
        writeFileSync(`${this.agent.userDataDir}/bots/${name}/last_profile.json`, JSON.stringify(this.profile, null, 4), (err) => {
            if (err) {
                throw err;
            }
            console.log("Copy profile saved.");
        });
    }

    getName() {
        return this.profile.name;
    }

    getInitModes() {
        return this.profile.modes;
    }

    async initExamples() {
        console.log('Loading examples...')
        const startTime = performance.now();
        this.convo_examples = new Examples(this.embedding_model);
        await this.convo_examples.load(this.profile.conversation_examples);
        // this.coding_examples = new Examples(this.embedding_model);
        // await this.coding_examples.load(this.profile.coding_examples);
        const endTime = performance.now();
        console.log(`Examples loaded. Time taken: ${(endTime - startTime).toFixed(2)} ms`);
    }

    async replaceStrings(prompt, messages, examples=null, prev_memory=null, to_summarize=[], last_goals=null) {
        prompt = prompt.replaceAll('$NAME', this.agent.name);
        prompt = prompt.replaceAll('$OWNER', this.agent.owner);
        prompt = prompt.replaceAll('$LANGUAGE', this.agent.settings.language);
        prompt = prompt.replaceAll('$PERSONALITY', this.profile.personality);


        if (prompt.includes('$HUD')) {
            const { hudString } = await this.agent.headsUpDisplay();
            prompt = prompt.replaceAll('$HUD', `# Your heads up display\n${hudString}`);
        }

        if (prompt.includes('$COMMAND_DOCS'))
            prompt = prompt.replaceAll('$COMMAND_DOCS', getCommandDocs());
        if (prompt.includes('$CODE_DOCS'))
            prompt = prompt.replaceAll('$CODE_DOCS', getSkillDocs());
        if (prompt.includes('$EXAMPLES') && examples !== null)
            prompt = prompt.replaceAll('$EXAMPLES', await examples.createExampleMessage(messages));
        if (prompt.includes('$MEMORY'))
            prompt = prompt.replaceAll('$MEMORY', prev_memory ? prev_memory : 'None.');
        if (prompt.includes('$TO_SUMMARIZE'))
            prompt = prompt.replaceAll('$TO_SUMMARIZE', stringifyTurns(to_summarize));
        if (prompt.includes('$CONVO'))
            prompt = prompt.replaceAll('$CONVO', '# Recent conversation\n' + stringifyTurns(messages));
        if (prompt.includes('$LAST_GOALS')) {
            let goal_text = '';
            for (let goal in last_goals) {
                if (last_goals[goal])
                    goal_text += `You recently successfully completed the goal ${goal}.\n`
                else
                    goal_text += `You recently failed to complete the goal ${goal}.\n`
            }
            prompt = prompt.replaceAll('$LAST_GOALS', goal_text.trim());
        }
        if (prompt.includes('$BLUEPRINTS')) {
            if (this.agent.npc.constructions) {
                let blueprints = '';
                for (let blueprint in this.agent.npc.constructions) {
                    blueprints += blueprint + ', ';
                }
                prompt = prompt.replaceAll('$BLUEPRINTS', blueprints.slice(0, -2));
            }
        }

        // check if there are any remaining placeholders with syntax $<word>
        let remaining = prompt.match(/\$[A-Z_]+/g);
        if (remaining !== null) {
            console.warn('Unknown prompt placeholders:', remaining.join(', '));
        }

        return prompt;
    }

    async promptConvo(messages) {
        let prompt = this.profile.conversing;
        prompt = await this.replaceStrings(prompt, messages, this.convo_examples);

        let thought = await this.chat_model.think(messages, prompt);
        let chat_response = thought.chat_response;
        let execute_command = thought.execute_command;
        console.log('chat_response:', chat_response);
        console.log('execute_command:', execute_command);
        
        if (execute_command && !execute_command.startsWith('!')) {
            execute_command = '!' + execute_command;
        }
        
        return new Thought(chat_response || "On it.", execute_command);
    }

    async promptMemSaving(prev_mem, to_summarize) {
        let prompt = this.profile.saving_memory;
        prompt = await this.replaceStrings(prompt, null, null, prev_mem, to_summarize);
        return await this.chat_model.summarizeMemory([], prompt, '***');
    }
}