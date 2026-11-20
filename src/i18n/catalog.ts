import type { DocumentType, OCRService, Package } from '@/types';
import type { TranslationDictionary } from './vi';

const CANONICAL_SERVICE_SEEDS: Record<
  string,
  { name: string; description: string; longDescription: string; sla: string }
> = {
  'srv-id-ocr': {
    name: 'OCR Giấy tờ tùy thân (CCCD, GPLX, Hộ chiếu)',
    description:
      'Nhận diện & trích xuất JSON chuẩn hóa cho Căn cước công dân / CMND, Giấy phép lái xe và Hộ chiếu qua Web Portal và API.',
    longDescription:
      'Pipeline Hybrid AI thực tế gồm DocAligner (tách nền & xoay thẳng thẻ), RapidOCR (phát hiện dòng chữ), PaddleOCR-VL-Vi (nhận dạng tiếng Việt GPU) và Qwen2.5-3B (chuẩn hóa JSON có kiểm tra ràng buộc). Hỗ trợ xử lý trực tiếp trên Web và tích hợp qua REST API với X-API-Key, lưu đầy đủ lịch sử & ảnh đối soát.',
    sla: 'Hybrid AI Local/GPU',
  },
};

const CANONICAL_DOCTYPE_SEEDS: Record<string, { name: string; description: string }> = {
  'dt-id-card': {
    name: 'Căn cước công dân / CMND',
    description:
      'Nhận diện & trích xuất Căn cước công dân gắn chip, thẻ Căn cước 2024 và CMND (số định danh, họ tên, ngày sinh, giới tính, quốc tịch, quê quán, nơi thường trú, ngày cấp, có giá trị đến, nơi cấp).',
  },
  'dt-passport': {
    name: 'Hộ chiếu (Passport)',
    description:
      'Trích xuất thông tin Hộ chiếu Việt Nam & quốc tế chuẩn ICAO 9303: số hộ chiếu, loại hộ chiếu, mã quốc gia, họ tên, số CCCD/CMND, ngày sinh, giới tính, nơi sinh, ngày cấp, ngày hết hạn, cơ quan cấp và 2 dòng MRZ.',
  },
  'dt-driver-lic': {
    name: 'Giấy phép lái xe (GPLX)',
    description:
      'Bóc tách thông tin Giấy phép lái xe các hạng (A1, A2, B1, B2, C, D...): số GPLX, họ tên, ngày sinh, quốc tịch, nơi cư trú, hạng bằng, ngày cấp, ngày hết hạn và nơi cấp.',
  },
};

const CANONICAL_PACKAGE_SEEDS: Record<string, { name: string }> = {
  'pkg-id-starter': { name: 'ID Verification Starter' },
  'pkg-id-pro': { name: 'ID Verification Fleet' },
  'pkg-id-ent': { name: 'ID Verification Enterprise' },
};

const SERVICE_NAME_TO_CODE: Record<string, string> = Object.fromEntries(
  Object.entries(CANONICAL_SERVICE_SEEDS).map(([code, v]) => [v.name.trim(), code])
);

const PACKAGE_NAME_TO_CODE: Record<string, string> = Object.fromEntries(
  Object.entries(CANONICAL_PACKAGE_SEEDS).map(([code, v]) => [v.name.trim(), code])
);

export const localizeCategory = (category: string, dict: TranslationDictionary): string => {
  const categories = dict.common.categories as Record<string, string>;
  return categories[category] || category;
};

export const localizeQuotaType = (quotaType: string | undefined, dict: TranslationDictionary): string => {
  if (!quotaType) return '';
  const quotaTypes = dict.common.quotaTypes as Record<string, string>;
  return quotaTypes[quotaType] || quotaType;
};

export const localizeServiceName = (name: string | undefined, dict: TranslationDictionary): string => {
  if (!name) return '';
  const code = SERVICE_NAME_TO_CODE[name.trim()];
  if (!code) return name;
  const services = dict.catalog.services as Record<string, { name: string }>;
  return services[code]?.name || name;
};

export const localizePackageName = (name: string | undefined, dict: TranslationDictionary): string => {
  if (!name) return '';
  const code = PACKAGE_NAME_TO_CODE[name.trim()];
  if (!code) return name;
  const packages = dict.catalog.packages as Record<string, { name: string }>;
  return packages[code]?.name || name;
};

export const localizeCapability = (cap: string, dict: TranslationDictionary): string => {
  const map = dict.catalog.capabilities as Record<string, string>;
  return map[cap.trim()] || cap;
};

export const localizeLanguageLabel = (language: string, dict: TranslationDictionary): string => {
  const map = dict.catalog.languages as Record<string, string>;
  return map[language.trim()] || language;
};

export const localizeFeature = (feature: string, dict: TranslationDictionary): string => {
  const map = dict.catalog.features as Record<string, string>;
  return map[feature.trim()] || feature;
};

export const localizeService = (service: OCRService, dict: TranslationDictionary): OCRService => {
  const seed = CANONICAL_SERVICE_SEEDS[service.code];
  const loc = (dict.catalog.services as Record<
    string,
    { name: string; description: string; longDescription: string; sla: string }
  >)[service.code];

  const name =
    loc && seed && service.name.trim() === seed.name ? loc.name : localizeServiceName(service.name, dict);
  const description =
    loc && seed && service.description.trim() === seed.description ? loc.description : service.description;
  const longDescription =
    loc && seed && service.longDescription && service.longDescription.trim() === seed.longDescription
      ? loc.longDescription
      : service.longDescription;
  const sla = loc && seed && service.sla.trim() === seed.sla ? loc.sla : service.sla;

  return {
    ...service,
    name,
    description,
    longDescription,
    sla,
    capabilities: service.capabilities.map((c) => localizeCapability(c, dict)),
    supportedLanguages: service.supportedLanguages.map((l) => localizeLanguageLabel(l, dict)),
  };
};

export const localizeDocType = (doc: DocumentType, dict: TranslationDictionary): DocumentType => {
  const seed = CANONICAL_DOCTYPE_SEEDS[doc.code];
  const loc = (dict.catalog.docTypes as Record<string, { name: string; description: string }>)[doc.code];

  return {
    ...doc,
    name: loc && seed && doc.name.trim() === seed.name ? loc.name : doc.name,
    description: loc && seed && doc.description.trim() === seed.description ? loc.description : doc.description,
  };
};

export const localizePackage = (pkg: Package, dict: TranslationDictionary): Package => {
  const seed = CANONICAL_PACKAGE_SEEDS[pkg.code];
  const loc = (dict.catalog.packages as Record<string, { name: string }>)[pkg.code];

  return {
    ...pkg,
    name: loc && seed && pkg.name.trim() === seed.name ? loc.name : localizePackageName(pkg.name, dict),
    serviceName: localizeServiceName(pkg.serviceName, dict),
    features: pkg.features.map((f) => localizeFeature(f, dict)),
  };
};
