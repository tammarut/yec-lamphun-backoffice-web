export interface IHealthRepository {
	getDatabaseTime(): Promise<Date>
}
