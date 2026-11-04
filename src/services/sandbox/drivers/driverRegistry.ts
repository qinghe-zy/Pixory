/**
 * DocumentDriverRegistry 文档驱动注册中心
 *
 * 核心职责:
 * 1. 维护文件扩展名与 IDocumentDriver 实现的动态映射关系；
 * 2. 拒绝未知扩展名的静默降级，遇到不支持的文件格式明确抛出结构化异常；
 * 3. 支持运行期动态注册与扩展 (如未来加载 XlsxDriver、PptxDriver 无需改动编排内核)。
 */

import type { IDocumentDriver } from './baseDriver';

export class UnsupportedDocumentFormatError extends Error {
  public readonly extension: string;

  constructor(extension: string, message?: string) {
    const normExt = extension.startsWith('.') ? extension : `.${extension}`;
    super(message || `不支持的文档格式: "${normExt}"，未找到对应的文档驱动实现。`);
    this.name = 'UnsupportedDocumentFormatError';
    this.extension = normExt;
  }
}

export class DocumentDriverRegistry {
  private readonly extensionMap = new Map<string, IDocumentDriver>();

  constructor(initialDrivers?: IDocumentDriver[]) {
    if (Array.isArray(initialDrivers)) {
      for (const d of initialDrivers) {
        this.registerDriver(d);
      }
    }
  }

  /**
   * 规范化扩展名 (统一转为小写并确保前缀带点)
   */
  private normalizeExtension(ext: string): string {
    const trimmed = ext.trim().toLowerCase();
    if (!trimmed) return '';
    return trimmed.startsWith('.') ? trimmed : `.${trimmed}`;
  }

  /**
   * 从文件路径或 URI 中提取扩展名
   */
  private extractExtension(pathOrUri: string): string {
    const cleanPath = pathOrUri.split('?')[0].split('#')[0];
    const lastDot = cleanPath.lastIndexOf('.');
    if (lastDot === -1 || lastDot === cleanPath.length - 1) {
      return '';
    }
    const ext = cleanPath.slice(lastDot);
    return this.normalizeExtension(ext);
  }

  /**
   * 注册一个文档驱动
   */
  public registerDriver(driver: IDocumentDriver): void {
    if (!driver || !Array.isArray(driver.supportedExtensions)) {
      throw new Error('无效的文档驱动实现: supportedExtensions 必须为数组');
    }

    for (const ext of driver.supportedExtensions) {
      const normalized = this.normalizeExtension(ext);
      if (normalized) {
        this.extensionMap.set(normalized, driver);
      }
    }
  }

  /**
   * 注销指定的文档驱动
   */
  public unregisterDriver(driver: IDocumentDriver): void {
    if (!driver || !Array.isArray(driver.supportedExtensions)) return;
    for (const ext of driver.supportedExtensions) {
      const normalized = this.normalizeExtension(ext);
      if (this.extensionMap.get(normalized) === driver) {
        this.extensionMap.delete(normalized);
      }
    }
  }

  /**
   * 根据扩展名查找对应的驱动，若未注册则抛出 UnsupportedDocumentFormatError
   */
  public getDriverForExtension(ext: string): IDocumentDriver {
    const normalized = this.normalizeExtension(ext);
    const driver = this.extensionMap.get(normalized);
    if (!driver) {
      throw new UnsupportedDocumentFormatError(normalized);
    }
    return driver;
  }

  /**
   * 根据文件路径或 URI 查找匹配的驱动，若未注册则抛出 UnsupportedDocumentFormatError
   */
  public getDriverForPath(filePathOrUri: string): IDocumentDriver {
    const ext = this.extractExtension(filePathOrUri);
    if (!ext) {
      throw new UnsupportedDocumentFormatError('(unknown)', `无法识别文件路径 "${filePathOrUri}" 的扩展名`);
    }
    return this.getDriverForExtension(ext);
  }

  /**
   * 通用智能获取驱动 (自动支持路径或扩展名)
   */
  public getDriver(pathOrExt: string): IDocumentDriver {
    if (!pathOrExt.includes('/') && !pathOrExt.includes('\\')) {
      const norm = this.normalizeExtension(pathOrExt);
      if (this.extensionMap.has(norm)) {
        return this.getDriverForExtension(norm);
      }
    }
    return this.getDriverForPath(pathOrExt);
  }

  /**
   * 检查指定扩展名或路径是否具有可用的驱动
   */
  public hasDriver(pathOrExt: string): boolean {
    const ext = pathOrExt.includes('.') && !pathOrExt.startsWith('.')
      ? this.extractExtension(pathOrExt)
      : this.normalizeExtension(pathOrExt);
    return this.extensionMap.has(ext);
  }

  /**
   * 获取当前所有已注册的扩展名列表
   */
  public getSupportedExtensions(): string[] {
    return Array.from(this.extensionMap.keys()).sort();
  }

  /**
   * 清空所有已注册的驱动 (用于测试隔离)
   */
  public clear(): void {
    this.extensionMap.clear();
  }
}

/**
 * 全局默认单例注册表
 */
export const defaultDriverRegistry = new DocumentDriverRegistry();
