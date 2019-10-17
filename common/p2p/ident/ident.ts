import { Encoder, Decoder, base62 } from './code';

const key_usages: string[] = ['sign', 'verify'];
const key_params: EcKeyGenParams = {
    name: 'ECDSA',
    namedCurve: 'P-521',
};

const sign_params: EcdsaParams = {
    name: 'ECDSA',
    hash: 'SHA-512',
};

export class Ident {
    static async fromPublicKey(publicKey: Buffer) {
        let key = await crypto.subtle.importKey('raw', publicKey, key_params, true, ['verify']);
        let ident = Buffer.from(await crypto.subtle.digest('SHA-256', publicKey));
        return new Ident(key, publicKey, ident);
    }

    protected constructor(
        protected readonly publicKeyData: CryptoKey,
        readonly publicKey: Buffer,
        readonly identity: Buffer,
    ) { }

    get name() {
        return base62.encode(this.identity);
    }

    async verify(data: Buffer | Uint8Array, signature: Buffer) {
        return await crypto.subtle.verify(sign_params, this.publicKeyData, signature, data);
    }

    async validate(endorsement: Buffer) {
        let src = new Decoder(endorsement);
        let signature = src.bytes();
        if (!await this.verify(src.remaining, signature))
            return null;

        return src;
    }
}

export class FullIdent extends Ident {
    static async generate() {
        let pair = await crypto.subtle.generateKey(key_params, true, key_usages) as CryptoKeyPair;
        return await this.fromKeyPair(pair);
    }

    static async fromKeyPair(pair: CryptoKeyPair) {
        let publicKey = Buffer.from(await crypto.subtle.exportKey('raw', pair.publicKey));
        let identity = Buffer.from(await crypto.subtle.digest('SHA-256', publicKey));
        return new FullIdent(pair.privateKey, pair.publicKey, publicKey, identity);
    }

    static async import(raw: string) {
        let json = JSON.parse(Buffer.from(raw, 'base64').toString('utf8'));
        let [a, b] = await Promise.all([
            crypto.subtle.importKey('jwk', json.public, key_params, true, ['verify']),
            crypto.subtle.importKey('jwk', json.private, key_params, true, ['sign']),
        ]);

        return this.fromKeyPair({
            publicKey: a,
            privateKey: b,
        });
    }

    private constructor(
        private readonly privateKey: CryptoKey,
        publicKeyData: CryptoKey,
        publicKey: Buffer,
        identity: Buffer,
    ) {
        super(publicKeyData, publicKey, identity);
    }

    async export() {
        let [a, b] = await Promise.all([
            crypto.subtle.exportKey('jwk', this.publicKeyData),
            crypto.subtle.exportKey('jwk', this.privateKey),
        ]);

        let json = { public: a, private: b };
        let data = Buffer.from(JSON.stringify(json));
        return data.toString('base64');
    }

    async sign(data: Buffer | Uint8Array) {
        return Buffer.from(await crypto.subtle.sign(sign_params, this.privateKey, data));
    }

    async endorse(data: Encoder) {
        let endorsement = new Encoder();
        endorsement.bytes(await this.sign(data.result));
        endorsement.include(data);
        return endorsement.result;
    }
}
