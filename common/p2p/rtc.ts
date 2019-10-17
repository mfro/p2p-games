import pako from 'pako';
import { FullIdent, Ident, Encoder, Decoder, base62 } from './ident';
import { event, pipe, Dialer, Sink, Source, Channel } from '../async';

const config = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
        { urls: 'stun:stun3.l.google.com:19302' },
        { urls: 'stun:stun4.l.google.com:19302' },
    ],
};

namespace ConnectInfo {
    export function pack(desc: RTCSessionDescriptionInit, candidates: RTCIceCandidate[]) {
        let pack = new Encoder();
        pack.string(desc.type);
        pack.string(desc.sdp || "");
        pack.uint(candidates.length);
        for (let ice of candidates)
            pack.string(ice.candidate);

        let zip = Buffer.from(pako.deflate(pack.result, { level: 9 }));
        return base62.encode(zip);
    }

    export function unpack(raw: string): [RTCSessionDescriptionInit, RTCIceCandidateInit[]] {
        let zip = base62.decode(raw);
        let pack = new Decoder(Buffer.from(pako.inflate(zip)));

        let init = {
            type: pack.string() as RTCSdpType,
            sdp: pack.string() || undefined,
        };

        let candidates = [];
        let count = pack.uint();
        for (let i = 0; i < count; ++i) {
            candidates.push({
                candidate: pack.string(),
                sdpMid: "0",
                sdpMLineIndex: 0,
            });
        }

        return [init, candidates];
    }
}

interface rtc {
    message: event<{ type: string }>,
    send(message: any): void;
}

async function rtc(self: FullIdent, args: rtc.Args): Promise<rtc> {
    let socket = new WebSocket(args.host + '/' + self.name, args.protcols);

    let ready = event();
    let message = event<{ type: string }>();

    socket.addEventListener('open', e => {
        ready.emit();
        socket.send(self.publicKey);
    });

    socket.addEventListener('message', e => {
        let msg = JSON.parse(e.data);
        message.emit(msg);
    });

    await ready.event.next();

    return {
        message: message.event,
        send(message) {
            socket.send(JSON.stringify(message));
        },
    };
}

namespace rtc {
    export interface Args {
        host: string,
        protcols?: string[],
    }

    export function dialer(rtc: rtc): Dialer {
        function makeChannel(base: RTCDataChannel): Channel {
            return {
                ...makeChannelSink(base),
                ...makeChannelSource(base),
            };
        }

        async function prepareLocal(conn: RTCPeerConnection, local: RTCSessionDescriptionInit) {
            let candidates: RTCIceCandidate[] = [];

            await conn.setLocalDescription(local);
            await new Promise((resolve, reject) => {
                let listener = (e: RTCPeerConnectionIceEvent) => {
                    if (e.candidate) {
                        candidates.push(e.candidate);
                    } else {
                        conn.removeEventListener('icecandidate', listener);
                        resolve();
                    }
                };

                conn.addEventListener('icecandidate', listener);
            });

            return ConnectInfo.pack(local, candidates);
        }

        async function prepareRemote(conn: RTCPeerConnection, info: string) {
            let [offer, candidates] = ConnectInfo.unpack(info);

            await conn.setRemoteDescription(offer);
            await Promise.all(candidates.map(ice => conn.addIceCandidate(ice)));
        }

        return {
            async dial(target) {
                let conn = new RTCPeerConnection(config);
                let data = conn.createDataChannel('master', {
                    id: 0,
                    ordered: true,
                    negotiated: true,
                });

                let local = await prepareLocal(conn, await conn.createOffer());
                rtc.send({
                    type: 'offer',
                    name: target,
                    info: local,
                });

                let remote = await rtc.message.until(msg => {
                    if (msg.type != 'answer') return;
                    let answer = msg as any as { name: string, info: string };
                    if (answer.name != target) return;
                    return answer.info;
                });

                await prepareRemote(conn, remote);

                await event.wrap(data, 'open').next();

                return makeChannel(data);
            },

            incoming: {
                async attach(callback) {
                    while (true) {
                        let conn = new RTCPeerConnection(config);
                        let data = conn.createDataChannel('master', {
                            id: 0,
                            ordered: true,
                            negotiated: true,
                        });

                        let { name: target, info: remote } = await rtc.message.until(msg => {
                            if (msg.type != 'offer') return;
                            return msg as any as { name: string, info: string };
                        });

                        await prepareRemote(conn, remote);

                        let local = await prepareLocal(conn, await conn.createAnswer());
                        rtc.send({
                            type: 'answer',
                            name: target,
                            info: local,
                        });

                        await event.wrap(data, 'open').next();

                        let result = callback({
                            name: target,
                            channel: makeChannel(data),
                        });

                        if (result !== undefined) {
                            return result;
                        }
                    }
                },
            },
        };
    }
}

export default rtc;

function makeChannelSink(base: RTCDataChannel): Sink {
    let complete = false;
    let ready = event.wrap(base, 'bufferedamountlow') as event<Event>;

    base.addEventListener('close', () => {
        complete = true;
    });

    return {
        close() {
            complete = true;
            base.close();
        },

        async write(block) {
            if (base.bufferedAmount > base.bufferedAmountLowThreshold)
                await ready.next();
            base.send(block);
        },
    };
}

function makeChannelSource(base: RTCDataChannel): Source {
    let data = pipe<Buffer>();

    base.addEventListener('close', e => data.close());
    base.addEventListener('message', e => data.write(Buffer.from(e.data, 0)));

    return { attach: data.attach };
}
