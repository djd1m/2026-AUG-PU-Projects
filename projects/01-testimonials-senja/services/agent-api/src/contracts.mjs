const id = { type: 'string', minLength: 1, maxLength: 160 };
const text = { type: 'string', minLength: 1, maxLength: 100 };
export const commands = Object.freeze({
  buyer_link_start: { properties: { displayName: text, audience: id }, required: ['displayName', 'audience'], public: true },
  buyer_link_status: { properties: { pairingId: id, pollToken: id }, required: ['pairingId', 'pollToken'], public: true, read: true },
  offer_get: { properties: { productId: id }, required: ['productId'], read: true },
  order_create: { properties: { quoteId: id, requestKey: id }, required: ['quoteId', 'requestKey'] },
  payment_execute: { properties: { orderId: id, mandateId: id }, required: ['orderId'] },
  order_get: { properties: { orderId: id }, required: ['orderId'], read: true },
});
export class GatewayError extends Error {
  constructor(code, status = 400) { super(code); this.code = code; this.status = status; }
}
export function object(value, fields, required = fields) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).some(key => !fields.includes(key))
    || required.some(key => !Object.hasOwn(value, key))) throw new GatewayError('INVALID_INPUT');
}
export function validateCommand(command, input) {
  if (!Object.hasOwn(commands, command)) throw new GatewayError('UNKNOWN_COMMAND');
  const schema = commands[command];
  object(input, Object.keys(schema.properties), schema.required);
  for (const [key, value] of Object.entries(input)) {
    const constraint = schema.properties[key];
    if (typeof value !== 'string' || value.length < constraint.minLength || value.length > constraint.maxLength
      || /[\u0000-\u001f\u007f]/.test(value)) throw new GatewayError('INVALID_INPUT');
  }
}
export function tools() {
  return Object.entries(commands).map(([name, schema]) => ({
    name,
    description: name === 'payment_execute'
      ? 'Request execution of an existing order. Backend enforces buyer consent and limits. Human approval may be required. A timeout is NOT permission to create another payment.'
      : `${name}: use the backend buyer authority. Linking grants are displayed only to the authenticated human.`,
    inputSchema: { type: 'object', properties: schema.properties, required: schema.required, additionalProperties: false },
    annotations: { readOnlyHint: !!schema.read, destructiveHint: name === 'payment_execute',
      idempotentHint: name !== 'buyer_link_start' && name !== 'offer_get', openWorldHint: name === 'payment_execute' },
  }));
}
