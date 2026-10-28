// Minimal Apache-2.0 protocol projection of yandex-cloud/cloudapi
// b5702253b8216fa5cdac9f70509ed608eb0f17f5, ai/stt/v3/{stt,stt_service}.proto.
// Official field numbers are independently checked against full-schema golden bytes.
// Embedded descriptor ships with compiled JS: no runtime proto/build asset paths.
import { fromJSON, type ServiceDefinition } from '@grpc/proto-loader';
export const YANDEX_HOST = 'stt.api.cloud.yandex.net:443';
export const YANDEX_METHOD = '/speechkit.stt.v3.Recognizer/RecognizeStreaming';
const messages = {
  StreamingRequest: { oneofs: { Event: { oneof: ['session_options', 'chunk'] } }, fields: {
    session_options: { type: 'StreamingOptions', id: 1 }, chunk: { type: 'AudioChunk', id: 2 } } },
  StreamingOptions: { fields: { recognition_model: { type: 'RecognitionModelOptions', id: 1 } } },
  RecognitionModelOptions: { fields: {
    model: { type: 'string', id: 1 }, audio_format: { type: 'AudioFormatOptions', id: 2 },
    text_normalization: { type: 'TextNormalizationOptions', id: 3 }, language_restriction: { type: 'LanguageRestrictionOptions', id: 4 },
    audio_processing_type: { type: 'AudioProcessingType', id: 5 } } },
  AudioProcessingType: { values: { AUDIO_PROCESSING_TYPE_UNSPECIFIED: 0, REAL_TIME: 1, FULL_DATA: 2 } },
  AudioFormatOptions: { fields: { container_audio: { type: 'ContainerAudio', id: 2 } } },
  ContainerAudio: { fields: { container_audio_type: { type: 'ContainerAudioType', id: 1 } } },
  ContainerAudioType: { values: { CONTAINER_AUDIO_TYPE_UNSPECIFIED: 0, WAV: 1, OGG_OPUS: 2, MP3: 3 } },
  TextNormalizationOptions: { fields: { text_normalization: { type: 'TextNormalization', id: 1 } } },
  TextNormalization: { values: { TEXT_NORMALIZATION_UNSPECIFIED: 0, TEXT_NORMALIZATION_ENABLED: 1, TEXT_NORMALIZATION_DISABLED: 2 } },
  LanguageRestrictionOptions: { fields: { restriction_type: { type: 'LanguageRestrictionType', id: 1 }, language_code: { type: 'string', id: 2, rule: 'repeated' } } },
  LanguageRestrictionType: { values: { LANGUAGE_RESTRICTION_TYPE_UNSPECIFIED: 0, WHITELIST: 1, BLACKLIST: 2 } },
  AudioChunk: { fields: { data: { type: 'bytes', id: 1 } } },
  StreamingResponse: { oneofs: { Event: { oneof: ['partial', 'final', 'eou_update', 'final_refinement', 'status_code'] } }, fields: {
    session_uuid: { type: 'SessionUuid', id: 1 }, response_wall_time_ms: { type: 'int64', id: 3 },
    audio_cursors: { type: 'AudioCursors', id: 2 }, partial: { type: 'AlternativeUpdate', id: 4 }, final: { type: 'AlternativeUpdate', id: 5 },
    eou_update: { type: 'Ignored', id: 6 }, final_refinement: { type: 'Ignored', id: 7 }, status_code: { type: 'Ignored', id: 8 }, channel_tag: { type: 'string', id: 9 } } },
  SessionUuid: { fields: { uuid: { type: 'string', id: 1 }, user_request_id: { type: 'string', id: 2 } } },
  Ignored: { fields: {} },
  AudioCursors: { fields: { final_index: { type: 'int64', id: 5 } } },
  AlternativeUpdate: { fields: { alternatives: { type: 'Alternative', id: 1, rule: 'repeated' }, channel_tag: { type: 'string', id: 2 } } },
  Alternative: { fields: { words: { type: 'Word', id: 1, rule: 'repeated' }, text: { type: 'string', id: 2 },
    start_time_ms: { type: 'int64', id: 3 }, end_time_ms: { type: 'int64', id: 4 }, languages: { type: 'LanguageEstimation', id: 6, rule: 'repeated' } } },
  Word: { fields: { text: { type: 'string', id: 1 }, start_time_ms: { type: 'int64', id: 2 }, end_time_ms: { type: 'int64', id: 3 } } },
  LanguageEstimation: { fields: { language_code: { type: 'string', id: 1 } } },
  Recognizer: { methods: { RecognizeStreaming: { comment: '', requestType: 'StreamingRequest', responseType: 'StreamingResponse', requestStream: true, responseStream: true } } },
};
const definition = fromJSON({ nested: { speechkit: { nested: { stt: { nested: { v3: { nested: messages } } } } } } }, { keepCase: true, longs: String, enums: String, defaults: true, oneofs: true });
export const yandexMethod = (definition['speechkit.stt.v3.Recognizer'] as ServiceDefinition).RecognizeStreaming!;
export const yandexSession = { session_options: { recognition_model: {
  model: 'general', audio_format: { container_audio: { container_audio_type: 'MP3' } },
  text_normalization: { text_normalization: 'TEXT_NORMALIZATION_DISABLED' },
  language_restriction: { restriction_type: 'WHITELIST', language_code: ['ru-RU'] }, audio_processing_type: 'FULL_DATA',
} } };
