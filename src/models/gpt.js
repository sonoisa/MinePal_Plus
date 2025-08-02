import OpenAI from 'openai';
import { Langfuse } from "langfuse";
import { Thought } from "../agent/thought.js";

const DEBUG = false;

const MAX_RETRIES = 2;
// const REQUEST_TIMEOUT = 3000; // msec

export class GPT {
    constructor(model_name, embedding_model_name) {
        this.model_name = model_name || "gpt-4o-mini";
        this.embedding_model_name = embedding_model_name || "text-embedding-3-small";

        console.log(`Using model: ${model_name}`);
        console.log(`Using embedding model: ${embedding_model_name}`);

        this.openai_api_key = process.env.OPENAI_API_KEY;
        this.openai = new OpenAI({
            apiKey: this.openai_api_key
        });

        if (DEBUG) {
            // logging with Langfuse
            let langfuse_secret_key = process.env.MINEPAL_LANGFUSE_SECRET_KEY;
            let langfuse_public_key = process.env.MINEPAL_LANGFUSE_PUBLIC_KEY;
            let langfuse_baseurl = process.env.MINEPAL_LANGFUSE_BASEURL;

            if (langfuse_secret_key !== undefined && langfuse_public_key !== undefined && langfuse_baseurl !== undefined) {
                this.langfuse = new Langfuse({
                    secretKey: langfuse_secret_key,
                    publicKey: langfuse_public_key,
                    baseUrl: langfuse_baseurl
                });
                this.trace = null;
            }
        }
    }

    async think(turns, systemMessage, stop_seq='***') {
        let messages = [{'role': 'system', 'content': systemMessage.trim()}].concat(turns);

        let trace = this.trace || this.langfuse?.trace({
            name: "Response generation",
        });

        const span = trace?.span({
            name: "Response generation",
            input: messages
        });

        let attempt = 0;    
        while (attempt <= MAX_RETRIES) {
            try {
                let result;
                result = await this._sendJsonRequest(messages, stop_seq, span);
                
                span?.update({
                    endTime: new Date(),
                    output: result
                });

                const thought = new Thought(result.chat_response || "", result.execute_command || "");

                return thought;
            } catch (err) {
                console.error("Request failed:", err);
                // console.error("Request failed");
                attempt++;
            }
        }

        let res = "Oops! OpenAI's server took an arrow to the knee. Mind trying that prompt again?";

        span?.update({
            endTime: new Date(),
            statusMessage: res,
            level: "ERROR"
        });

        return new Thought(res);
    }

    async _sendJsonRequest(messages, stop_seq, span) {
        const modelParameters = {
            model: this.model_name,
            stop: stop_seq,
            max_completion_tokens: 512
        };

        const generation = span?.generation({
            name: "Response generation",
            model: this.model_name,
            modelParameters: modelParameters,
            input: messages
        });

        try {
            let completion = await this.openai.chat.completions.create({...modelParameters, messages });

            generation?.update({
                output: completion,
                endTime: new Date()
            });

            let finish_reason = completion.choices[0].finish_reason;
            if (finish_reason == "stop") {
                let content = completion.choices[0].message.content;
                return JSON.parse(content);
            } else if (finish_reason == "length") {
                throw new Error("finish_reason is 'length' in the JSON mode.");
            } else {
                throw new Error("finish_reason is not 'stop'.");
            }
        } catch (err) {
            generation?.update({
                statusMessage: err.message,
                endTime: new Date()
            });

            throw err;
        }
    }

    async summarizeMemory(turns, systemMessage, stop_seq='***') {
        let messages = [{'role': 'system', 'content': systemMessage.trim()}].concat(turns);

        let trace = this.trace || this.langfuse?.trace({
            name: "Memory optimization",
        });

        const span = trace?.span({
            name: "Memory optimization",
            input: messages
        });

        let attempt = 0;    
        while (attempt <= MAX_RETRIES) {
            try {
                let result;
                result = await this._sendStringRequest(messages, stop_seq, span);
                
                span?.update({
                    endTime: new Date(),
                    output: result
                });

                return result;
            } catch (err) {
                console.error("Request failed:", err);
                // console.error("Request failed");
                attempt++;
            }
        }

        let res = "Oops! OpenAI's server took an arrow to the knee. Mind trying that prompt again?";

        span?.update({
            endTime: new Date(),
            statusMessage: res,
            level: "ERROR"
        });

        return res;
    }

    async _sendStringRequest(messages, stop_seq, span) {
        const modelParameters = {
            model: this.model_name,
            stop: stop_seq
        };

        const generation = span?.generation({
            name: "Response generation",
            model: this.model_name,
            modelParameters: modelParameters,
            input: messages
        });

        try {
            let completion = await this.openai.chat.completions.create({ ...modelParameters, messages});

            generation?.update({
                output: completion,
                endTime: new Date()
            });

            let finish_reason = completion.choices[0].finish_reason;
            if (finish_reason == "stop") {
                return completion.choices[0].message.content;
            } else {
                throw new Error("finish_reason is not 'stop'.");
            }
        } catch (err) {
            generation?.update({
                statusMessage: err.message,
                endTime: new Date()
            });

            throw err;
        }
    }

    async embed(text) {
        let embedding_model_name = this.embedding_model_name;

        try {
            const embedding = await this.openai.embeddings.create({
                model: embedding_model_name,
                input: text,
                encoding_format: "float",
            });

            return embedding.data[0].embedding;
        } catch (err) {
            console.log(err);
            throw new Error('Failed to get embedding');
        }
    }
}