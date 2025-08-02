export class Thought {
	constructor(chat_response, execute_command="") {
		this.chat_response = chat_response;
        this.execute_command = execute_command;
	}
    
	getJson() {
        return {
            "chat_response": this.chat_response,
            "execute_command": this.execute_command
        };
	}
}