declare global {
    namespace Express {
        interface User {
            id?: number;
            sub: number;
            email?: string;
            role?: string;
        }
    }
}

export { };