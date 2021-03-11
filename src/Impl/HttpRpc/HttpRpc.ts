export interface Job {
    service: string;
    args: any[];
}

export type JobResult = JobSuccess | JobError;

export function isJobError(jobResult: JobResult): jobResult is JobError {
    return !!(jobResult as any).error;
}

export interface JobSuccess {
    indices: number[];
    data: any;
    read: string[];
    changed: string[];
}

export interface JobError {
    indices: number[];
    error: any;
}