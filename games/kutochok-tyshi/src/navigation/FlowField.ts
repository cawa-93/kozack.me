export enum FlowDirection {
  Up = 0,
  Right = 1,
  Down = 2,
  Left = 3,
  None = 255,
}

export interface FlowField {
  readonly profileId: string;
  readonly gridRevision: number;
  readonly width: number;
  readonly height: number;
  readonly costToCore: Float64Array;
  readonly nextDirection: Uint8Array;
}
