declare global {
    namespace NodeJS {
        interface ProcessEnv extends Env {
            NODE_ENV: "local" | "test" | "production"
            ADMIN_PASSWORD: string
        }
    }
}

export { }
export type IEnv = Env
