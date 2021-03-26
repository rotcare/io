import { Database, Scene, Service, ServiceRequest } from './Scene';

export class ServiceDispatcher implements Service {
    constructor(private readonly database: Database, private readonly defaultService: Service) {}
    public async callMethod(scene: Scene, request: ServiceRequest): Promise<any> {
        if (request.serviceName === 'db') {
            const method = Reflect.get(this.database, request.methodName);
            return method.call(this.database, scene, ...request.args);
        }
        return this.defaultService.callMethod(scene, request);
    }
    public async onSceneFinished(scene: Scene): Promise<void> {
        await Promise.all([
            this.database.onSceneFinished(scene),
            this.defaultService && this.defaultService.onSceneFinished(scene),
        ]);
    }
}
