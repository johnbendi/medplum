/*
 * Generated by @medplum/generator
 * Do not edit manually.
 */

import { Expression } from './Expression';
import { Meta } from './Meta';
import { Reference } from './Reference';

/**
 * Access Policy for user or user group that defines how entities can or
 * cannot access resources.
 */
export interface AccessPolicy {

  /**
   * This is a AccessPolicy resource
   */
  readonly resourceType: 'AccessPolicy';

  /**
   * The logical id of the resource, as used in the URL for the resource.
   * Once assigned, this value never changes.
   */
  id?: string;

  /**
   * The metadata about the resource. This is content that is maintained by
   * the infrastructure. Changes to the content might not always be
   * associated with version changes to the resource.
   */
  meta?: Meta;

  /**
   * A reference to a set of rules that were followed when the resource was
   * constructed, and which must be understood when processing the content.
   * Often, this is a reference to an implementation guide that defines the
   * special rules along with other profiles etc.
   */
  implicitRules?: string;

  /**
   * The base language in which the resource is written.
   */
  language?: string;

  /**
   * A name associated with the AccessPolicy.
   */
  name?: string;

  /**
   * Optional compartment for newly created resources.  If this field is
   * set, any resources created by a user with this access policy will
   * automatically be included in the specified compartment.
   */
  compartment?: Reference;

  /**
   * Access details for a resource type.
   */
  resource?: AccessPolicyResource[];

  /**
   * Use IP Access Rules to allowlist, block, and challenge traffic based
   * on the visitor IP address.
   */
  ipAccessRule?: AccessPolicyIpAccessRule[];
}

/**
 * Use IP Access Rules to allowlist, block, and challenge traffic based
 * on the visitor IP address.
 */
export interface AccessPolicyIpAccessRule {

  /**
   * Friendly name that will make it easy for you to identify the IP Access
   * Rule in the future.
   */
  name?: string;

  /**
   * An IP Access rule will apply a certain action to incoming traffic
   * based on the visitor IP address or IP range.
   */
  value?: string;

  /**
   * Access rule can perform one of the following actions: &quot;allow&quot; |
   * &quot;block&quot;.
   */
  action?: 'allow' | 'block';
}

/**
 * Access details for a resource type.
 */
export interface AccessPolicyResource {

  /**
   * The resource type.
   */
  resourceType?: string;

  /**
   * DEPRECATED Optional compartment restriction for the resource type.
   */
  compartment?: Reference;

  /**
   * The rules that the server should use to determine which resources to
   * allow.
   */
  criteria?: string;

  /**
   * Optional flag to indicate that the resource type is read-only.
   */
  readonly?: boolean;

  /**
   * Optional list of hidden fields.  Hidden fields are not readable or
   * writeable.
   */
  hiddenFields?: string[];

  /**
   * Optional list of read-only fields.  Read-only fields are readable but
   * not writeable.
   */
  readonlyFields?: string[];

  /**
   * Invariants that must be satisfied for the resource to be written.  Can
   * include %before and %after placeholders to refer to the resource
   * before and after the updates are applied.
   */
  writeConstraint?: Expression[];
}
