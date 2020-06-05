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
    export function pack(desc: RTCSessionDescriptionInit) {
        let pack = new Encoder();
        pack.string(desc.type!);
        pack.string(desc.sdp || "");

        let zip = Buffer.from(pako.deflate(pack.result, { level: 9 }));
        return base62.encode(zip);
    }

    export function unpack(raw: string): RTCSessionDescriptionInit {
        let zip = base62.decode(raw);
        let pack = new Decoder(Buffer.from(pako.inflate(zip)));

        let init = {
            type: pack.string() as RTCSdpType,
            sdp: pack.string() || undefined,
        };

        return init;
    }

    export function pack_candidate(ice: RTCIceCandidate) {
        let pack = new Encoder();
        pack.string(ice.candidate);

        let zip = Buffer.from(pako.deflate(pack.result, { level: 9 }));
        return base62.encode(zip);
    }

    export function unpack_candidate(raw: string): RTCIceCandidateInit {
        let zip = base62.decode(raw);
        let pack = new Decoder(Buffer.from(pako.inflate(zip)));

        return {
            candidate: pack.string(),
            sdpMid: "0",
            sdpMLineIndex: 0,
        };
    }
}

interface rtc {
    nodes: Set<string>,
    nodesChange: event<{ change: 'join' | 'leave', name: string }>,

    message: event<{ type: string }>,
    send(message: any): void;
}

async function rtc(self: FullIdent, args: rtc.Args): Promise<rtc> {
    let socket = new WebSocket(args.host + '/' + self.name, args.protcols);

    let nodes = new Set<string>();
    let nodesChange = event<{ change: 'join' | 'leave', name: string }>();

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

    message.event.listen(e => {
        if (e.type == 'init') {
            for (let name of (e as any).nodes) {
                nodes.add(name)
                nodesChange.emit({ change: 'join', name });
            }
        } else if (e.type == 'join') {
            let name = (e as any).name;
            nodes.add(name);
            nodesChange.emit({ change: 'join', name });
        } else if (e.type == 'leave') {
            let name = (e as any).name;
            nodes.delete(name);
            nodesChange.emit({ change: 'leave', name });
        }
    });

    return {
        nodes,
        nodesChange: nodesChange.event,

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

        function prepareICE(conn: RTCPeerConnection, target: string) {
            let listener = (e: RTCPeerConnectionIceEvent) => {
                if (e.candidate) {
                    rtc.send({
                        type: 'candidate',
                        name: target,
                        info: ConnectInfo.pack_candidate(e.candidate),
                    });
                } else {
                    conn.removeEventListener('icecandidate', listener);
                }
            };

            conn.addEventListener('icecandidate', listener);

            rtc.message.until(msg => {
                if (msg.type != 'candidate') return;
                let candidate = msg as any as { name: string, info: string };
                if (candidate.name != target) return;

                let ice = ConnectInfo.unpack_candidate(candidate.info);
                conn.addIceCandidate(ice);
            });
        }

        return {
            async dial(target) {
                let conn = new RTCPeerConnection(config);
                let data = conn.createDataChannel('master', {
                    id: 0,
                    ordered: true,
                    negotiated: true,
                });

                prepareICE(conn, target);

                console.log('sending offer');
                let local = await conn.createOffer();
                await conn.setLocalDescription(local);
                rtc.send({
                    type: 'offer',
                    name: target,
                    info: ConnectInfo.pack(local),
                });

                console.log('waiting for answer');
                let remote = await rtc.message.until(msg => {
                    if (msg.type != 'answer') return;
                    let answer = msg as any as { name: string, info: string };
                    if (answer.name != target) return;
                    return answer.info;
                });

                await conn.setRemoteDescription(ConnectInfo.unpack(remote));

                console.log('waiting for open');
                await event.wrap(data, 'open').next();
                console.log('opened');

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

                        prepareICE(conn, target);

                        await conn.setRemoteDescription(ConnectInfo.unpack(remote));

                        console.log('sending answer');
                        let local = await conn.createAnswer();
                        await conn.setLocalDescription(local);
                        rtc.send({
                            type: 'answer',
                            name: target,
                            info: ConnectInfo.pack(local),
                        });

                        console.log('waiting for open');
                        await event.wrap(data, 'open').next();
                        console.log('opened');

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
