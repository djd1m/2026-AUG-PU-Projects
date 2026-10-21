import { z } from 'zod';
import { DomainError, type Clock } from '../common';

export const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;
export const credentialsSchema = z.object({
  email: z.string().trim().email().max(254).transform(value => value.toLowerCase()),
  password: z.string().refine(value => Array.from(value).length >= 12 && Array.from(value).length <= 72 && new TextEncoder().encode(value).length <= 72,
    'Пароль: от 12 символов и не более 72 байт UTF-8'),
}).strict();
export interface AccountCredentials { id: string; passwordHash: string; status: 'active' | 'disabled' }
export interface SessionInput { tokenHash: string; expiresAt: Date }
export interface Actor { accountId: string }
export interface AuthStore {
  findAccount(email: string): Promise<AccountCredentials | null>;
  register(email: string, passwordHash: string, session: SessionInput): Promise<void>;
  createSession(account: AccountCredentials, session: SessionInput): Promise<boolean>;
  revoke(tokenHash: string): Promise<void>;
  findSession(tokenHash: string, now: Date): Promise<Actor | null>;
}
export interface PasswordPort { hash(password: string): Promise<string>; compare(password: string, hash: string): Promise<boolean>; dummyHash: string }
export interface TokenPort { create(): string; hash(token: string): string }
/** N6 service adapted: crypto and bcrypt are ports; no transaction spans password work. */
export class AuthService {
  constructor(private readonly store: AuthStore, private readonly passwords: PasswordPort,
    private readonly tokens: TokenPort, private readonly clock: Clock) {}
  private credentials(email: string, password: string) {
    const parsed = credentialsSchema.safeParse({ email, password });
    if (!parsed.success) throw new DomainError(422, 'INVALID_CREDENTIALS', 'Укажите корректную почту и пароль от 12 символов до 72 байт UTF-8');
    return parsed.data;
  }
  private session() {
    const token = this.tokens.create();
    return { token, record: { tokenHash: this.tokens.hash(token), expiresAt: new Date(this.clock.now().getTime() + SESSION_TTL_SECONDS * 1000) } };
  }
  async register(email: string, password: string): Promise<string> {
    const input = this.credentials(email, password);
    const passwordHash = await this.passwords.hash(input.password);
    const session = this.session();
    await this.store.register(input.email, passwordHash, session.record);
    return session.token; // Conflict has the same response, but the token has no stored session.
  }
  async login(email: string, password: string): Promise<string> {
    const input = this.credentials(email, password);
    const account = await this.store.findAccount(input.email);
    const matches = await this.passwords.compare(input.password, account?.passwordHash ?? this.passwords.dummyHash);
    if (!account || !matches || account.status !== 'active') throw new DomainError(401, 'UNAUTHENTICATED', 'Неверная почта или пароль');
    const session = this.session();
    if (!await this.store.createSession(account, session.record)) throw new DomainError(401, 'UNAUTHENTICATED', 'Неверная почта или пароль');
    return session.token;
  }
  async logout(token: string): Promise<void> { await this.store.revoke(this.tokens.hash(token)); }
  async authenticate(token: string): Promise<Actor | null> {
    if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
    return this.store.findSession(this.tokens.hash(token), this.clock.now());
  }
}
export const projectCreateSchema = z.object({ name: z.string().trim().min(1).max(120), region: z.string().trim().min(1).max(120) }).strict();
export const projectPatchSchema = z.object({ name: z.string().trim().min(1).max(120).optional(), region: z.string().trim().min(1).max(120).optional(),
  store: z.string().trim().min(1).max(120).nullable().optional(), archive: z.literal(true).optional() }).strict().refine(value => Object.keys(value).length > 0);
export type ProjectCreate = z.infer<typeof projectCreateSchema>;
export type ProjectPatch = z.infer<typeof projectPatchSchema>;
export interface ProjectDto {
  id: string; name: string; region: string; store: string | null; state: 'active' | 'archived'; version: number;
  currentShellId: string | null; currentDesignId: string | null; currentBudgetId: string | null; sceneCatalog: unknown[]; createdAt: string;
}
export interface ProjectPage { items: ProjectDto[]; nextCursor: string | null }

/** Reusable project port; repositories retain atomic locking while domain owns bounded policy. */
export interface ProjectStore {
 create(actorId:string,input:ProjectCreate):Promise<ProjectDto>;
 get(actorId:string,projectId:string):Promise<ProjectDto>;
 list(actorId:string,limit?:number,cursor?:string):Promise<ProjectPage>;
 update(actorId:string,projectId:string,expectedVersion:number,patch:ProjectPatch):Promise<ProjectDto>;
}
export const MAX_PROJECTS=20, MAX_PROJECT_PAGE=50;
export function assertProjectCapacity(count:number):void {
 if(!Number.isSafeInteger(count)||count<0)throw new DomainError(503,'PROJECT_COUNT_INVALID','Операция временно недоступна');
 if(count>=MAX_PROJECTS)throw new DomainError(409,'PROJECT_LIMIT','Достигнут лимит 20 проектов');
}
export function assertProjectPage(limit:number):void {
 if(!Number.isInteger(limit)||limit<1||limit>MAX_PROJECT_PAGE)throw new DomainError(400,'INVALID_LIMIT','Размер страницы от 1 до 50');
}
