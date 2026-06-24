export interface TelemetryEvent {
  name: string;
  properties?: Record<string, string | number | boolean>;
  timestamp: string;
}

export class TelemetryService {
  private readonly queue: TelemetryEvent[] = [];

  record(name: string, properties?: TelemetryEvent["properties"]): void {
    this.queue.push({
      name,
      properties,
      timestamp: new Date().toISOString()
    });
  }

  flush(): TelemetryEvent[] {
    return this.queue.splice(0, this.queue.length);
  }
}
