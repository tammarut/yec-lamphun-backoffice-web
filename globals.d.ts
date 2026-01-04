declare global {
    namespace NodeJS {
        interface ProcessEnv extends Env {
            NODE_ENV: "local" | "test" | "production"
        }
    }
}

export { }
export type IEnv = Env
