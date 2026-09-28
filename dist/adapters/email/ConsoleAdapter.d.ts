import type { IEmailProvider } from "../../types";
export declare class ConsoleEmailAdapter implements IEmailProvider {
    sendMail(params: {
        to: string;
        subject: string;
        html: string;
        text?: string;
    }): Promise<void>;
}
