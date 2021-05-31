/*
 * Generated by com.medplum.generator.Generator
 * Do not edit manually.
 */

import { Extension } from './Extension';

/**
 * For referring to data content defined in other formats.
 */
export interface Attachment {

  /**
   * Unique id for the element within a resource (for internal references).
   * This may be any string value that does not contain spaces.
   */
  readonly id?: string;

  /**
   * May be used to represent additional information that is not part of
   * the basic definition of the element. To make the use of extensions
   * safe and manageable, there is a strict set of governance  applied to
   * the definition and use of extensions. Though any implementer can
   * define an extension, there is a set of requirements that SHALL be met
   * as part of the definition of the extension.
   */
  readonly extension?: Extension[];

  /**
   * Identifies the type of the data in the attachment and allows a method
   * to be chosen to interpret or render the data. Includes mime type
   * parameters such as charset where appropriate.
   */
  readonly contentType?: string;

  /**
   * The human language of the content. The value can be any valid value
   * according to BCP 47.
   */
  readonly language?: string;

  /**
   * The actual data of the attachment - a sequence of bytes, base64
   * encoded.
   */
  readonly data?: string;

  /**
   * A location where the data can be accessed.
   */
  readonly url?: string;

  /**
   * The number of bytes of data that make up this attachment (before
   * base64 encoding, if that is done).
   */
  readonly size?: number;

  /**
   * The calculated hash of the data using SHA-1. Represented using base64.
   */
  readonly hash?: string;

  /**
   * A label or set of text to display in place of the data.
   */
  readonly title?: string;

  /**
   * The date that the attachment was first created.
   */
  readonly creation?: Date;
}
