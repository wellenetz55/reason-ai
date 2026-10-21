// pako 1.x（jszip が中で使う版）には型が付いていないため、使う分だけ宣言する
declare module "pako" {
  export class Inflate {
    constructor(opts?: { raw?: boolean; chunkSize?: number });
    onData: (chunk: Uint8Array) => void;
    onEnd: (status: number) => void;
    push(data: Uint8Array | ArrayLike<number>, mode?: boolean | number): boolean;
    err: number;
    msg: string;
  }
}
