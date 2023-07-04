import { getExpressionForResourceType, isLowerCase } from '@medplum/core';
import { readJson } from '@medplum/definitions';
import { Bundle, BundleEntry, ElementDefinition, SearchParameter, StructureDefinition } from '@medplum/fhirtypes';
import fs, { writeFileSync } from 'fs';
import { JSDOM } from 'jsdom';
import * as mkdirp from 'mkdirp';
import fetch from 'node-fetch';
import * as path from 'path';
import { resolve } from 'path/posix';
import * as unzipper from 'unzipper';

import {
  DocumentationLocation,
  PropertyDocInfo,
  PropertyTypeDocInfo,
  ResourceDocsProps,
} from '../../docs/src/types/documentationTypes';

const searchParams: SearchParameter[] = [];
for (const entry of readJson('fhir/r4/search-parameters.json').entry as BundleEntry<SearchParameter>[]) {
  if (entry.resource) {
    searchParams.push(entry.resource);
  }
}
for (const entry of readJson('fhir/r4/search-parameters-medplum.json').entry as BundleEntry<SearchParameter>[]) {
  if (entry.resource) {
    searchParams.push(entry.resource);
  }
}

let documentedTypes: Record<string, DocumentationLocation>;

export async function main(): Promise<void> {
  const outputFolder = path.resolve(__dirname, '..', 'output');
  if (!fs.existsSync(outputFolder)) {
    fs.mkdirSync(outputFolder);
  }

  const indexedSearchParams = indexSearchParameters(searchParams);
  // Definitions for FHIR Spec resources
  const fhirCoreDefinitions = filterDefinitions(readJson(`fhir/r4/profiles-resources.json`));
  // Medplum-defined resources
  const medplumResourceDefinitions = filterDefinitions(readJson(`fhir/r4/profiles-medplum.json`));
  // StructureDefinitions for FHIR "Datatypes" (e.g. Address, ContactPoint, Identifier...)
  const fhirDatatypes = filterDefinitions(readJson(`fhir/r4/profiles-types.json`));
  // Map from resource/datatype name -> documented location
  documentedTypes = {
    ...Object.fromEntries(
      fhirCoreDefinitions.map((def): [string, DocumentationLocation] => [def.name || '', 'resource'])
    ),
    ...Object.fromEntries(fhirDatatypes.map((def): [string, DocumentationLocation] => [def.name || '', 'datatype'])),
    ...Object.fromEntries(
      medplumResourceDefinitions.map((def): [string, DocumentationLocation] => [def.name || '', 'medplum'])
    ),
  };
  const fhirResourceDocs = buildDocsDefinitions(fhirCoreDefinitions, 'resource', indexedSearchParams);
  const medplumResourceDocs = buildDocsDefinitions(medplumResourceDefinitions, 'medplum', indexedSearchParams);
  const fhirDatatypeDocs = buildDocsDefinitions(fhirDatatypes, 'datatype');

  const resourceIntroductions = await fetchFhirIntroductions(fhirCoreDefinitions);

  writeDocs(fhirResourceDocs, 'resource', resourceIntroductions);
  writeDocs(fhirDatatypeDocs, 'datatype');
  writeDocs(medplumResourceDocs, 'medplum');
}

/**
 * Indexes searcch parameters by "base" resource type.
 * @param searchParams The bundle of SearchParameter resources.
 * @returns A map from resourceType -> an array of associated SearchParameters
 */
function indexSearchParameters(searchParams: SearchParameter[]): Record<string, SearchParameter[]> {
  const results = {} as Record<string, SearchParameter[]>;
  for (const searchParam of searchParams) {
    for (const resType of searchParam.base || []) {
      if (!results[resType]) {
        results[resType] = [];
      }
      results[resType].push(searchParam);
    }
  }
  return results;
}

function buildDocsDefinitions(
  definitions: StructureDefinition[],
  location: DocumentationLocation,
  indexedSearchParams?: Record<string, SearchParameter[]>
): ResourceDocsProps[] {
  const results = [];
  for (const definition of definitions) {
    results.push(buildDocsDefinition(definition, location, indexedSearchParams?.[definition.name as string]));
  }

  return results;
}

function buildDocsDefinition(
  resourceDefinition: StructureDefinition,
  location: DocumentationLocation,
  searchParameters?: SearchParameter[]
): ResourceDocsProps {
  const result = {
    name: resourceDefinition.name as string,
    location,
    description: resourceDefinition.description || '',
    properties: [] as PropertyDocInfo[],
  } as ResourceDocsProps;
  const elements = resourceDefinition.snapshot?.element || [];
  for (const element of elements) {
    const parts = element.path?.split('.') || [];
    const name = parts[parts.length - 1];
    const { path, min, max, short, definition, comment } = element;
    result.properties.push({
      name,
      depth: parts.length - 1,
      ...getPropertyTypes(element),
      path: path || '',
      min: min || 0,
      max: max || '',
      short: short || '',
      definition: definition || '',
      comment: comment || '',
      ...getInheritance(element),
    });
  }

  if (searchParameters) {
    result.searchParameters = (searchParameters || []).map((param) => ({
      name: param.name as string,
      type: param.type as
        | 'string'
        | 'number'
        | 'uri'
        | 'date'
        | 'token'
        | 'reference'
        | 'composite'
        | 'quantity'
        | 'special',
      description: getSearchParamDescription(param, result.name),
      expression: getExpressionForResourceType(result.name, param.expression || '') || '',
    }));
  }
  return result;
}

function buildDocsMarkdown(position: number, definition: ResourceDocsProps, resourceIntroduction?: any): string {
  const resourceName = definition.name;
  const description = rewriteLinks(definition.description);
  return `\
---
title: ${resourceName}
sidebar_position: ${position}
---
import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';
import definition from '@site/static/data/${definition.location}Definitions/${resourceName.toLowerCase()}.json';
import { ResourcePropertiesTable, SearchParamsTable } from '@site/src/components/ResourceTables';

# ${resourceName}

${description}
${
  resourceIntroduction
    ? `
  <Tabs>
  <TabItem value="usage" label="Usage" default>
    ${resourceIntroduction.scopeAndUsage || ''}
  </TabItem>
  <TabItem value="backgroundAndContext" label="Background and Context">
  ${resourceIntroduction.backgroundAndContext || ''}
  </TabItem>
  <TabItem value="relationships" label="Relationships">
    ${resourceIntroduction.boundariesAndRelationships || ''}
  </TabItem>
  <TabItem value="referencedBy" label="Referenced By">
    <ul>${resourceIntroduction.referencedBy.map((e: string) => `<li><a href="${e}">${e}</a></li>`)}</ul>
  </TabItem>
</Tabs>`
    : ''
}


## Properties

<ResourcePropertiesTable properties={definition.properties.filter((p) => !(p.inherited && p.base.includes('Resource')))} />

${
  definition.location === 'resource' || definition.location === 'medplum'
    ? `## Search Parameters

<SearchParamsTable searchParams={definition.searchParameters} />

## Inherited Properties

<ResourcePropertiesTable properties={definition.properties.filter((p) => p.inherited && p.base.includes('Resource'))} />
`
    : ''
}

`;
}

function writeDocs(
  definitions: ResourceDocsProps[],
  location: DocumentationLocation,
  resourceIntroductions?: Record<string, any>
): void {
  definitions.forEach((definition, i) => {
    const resourceType = definition.name.toLowerCase();

    writeFileSync(
      resolve(__dirname, `../../docs/static/data/${location}Definitions/${resourceType}.json`),
      JSON.stringify(definition, null, 2),
      'utf8'
    );
    writeFileSync(
      resolve(__dirname, `../../docs/docs/api/fhir/${pluralize(location)}/${resourceType}.mdx`),
      buildDocsMarkdown(i, definition, resourceIntroductions?.[resourceType]),
      'utf8'
    );
  });
}

function filterDefinitions(bundle: Bundle): StructureDefinition[] {
  const definitions: StructureDefinition[] =
    bundle.entry
      ?.map((e) => e.resource as StructureDefinition)
      .filter((definition) => definition.resourceType === 'StructureDefinition') || [];

  return definitions.filter(
    (definition) =>
      definition.kind &&
      ['resource', 'complex-type'].includes(definition.kind) &&
      definition.name &&
      !['Resource', 'BackboneElement', 'DomainResource', 'MetadataResource', 'Element'].includes(definition.name) &&
      !isLowerCase(definition.name[0])
  );
}

function getSearchParamDescription(searchParam: SearchParameter, resourceType: string): string {
  const desc = searchParam.description;
  if (!desc) {
    return '';
  }

  if (desc.startsWith('Multiple Resources:')) {
    const lines = desc.split('\n');
    const resourceTypeLine = lines.find((line) => line.startsWith(`* [${resourceType}]`));
    if (resourceTypeLine) {
      return resourceTypeLine.substring(resourceTypeLine.indexOf(':') + 1);
    }
  }

  return desc;
}

function getPropertyTypes(property: ElementDefinition | undefined): Pick<PropertyDocInfo, 'types' | 'referenceTypes'> {
  const type = property?.type;
  if (!type) {
    return { types: [{ datatype: '', documentLocation: undefined }] };
  }

  const types: PropertyTypeDocInfo[] = type
    .map((t) => t.code || '')
    .map((code) =>
      code === 'http://hl7.org/fhirpath/System.String'
        ? { datatype: 'string', documentLocation: undefined }
        : { datatype: code, documentLocation: documentedTypes[code] }
    );

  const referenceIndex = types.findIndex((t) => t.datatype === 'Reference');
  if (referenceIndex >= 0) {
    const referenceTypes =
      type[referenceIndex].targetProfile
        ?.filter((target) => target.includes('/fhir/StructureDefinition/'))
        .map((target) => {
          const datatype = target.split('/').pop() || '';
          return { datatype, documentLocation: documentedTypes[datatype] };
        }) || [];
    return { types, referenceTypes };
  }
  return { types };
}

function getInheritance(property: ElementDefinition): { inherited: boolean; base?: string } {
  const inheritanceBase = property.base?.path?.split('.')[0];
  const inherited = !!inheritanceBase && property.path?.split('.')[0] !== inheritanceBase;
  if (!inherited) {
    return { inherited };
  }
  return { inherited, base: inheritanceBase };
}

function rewriteLinks(description: string): string {
  description = description
    .replace('(operations.html)', '(/api/fhir/operations)')
    .replace('(terminologies.html)', '(https://www.hl7.org/fhir/terminologies.html)');

  // Replace datatype internal links
  const datatypeLinkPattern = /datatypes.html#([a-zA-Z-]+)/g;
  const dtMatches = description.matchAll(datatypeLinkPattern);

  for (const match of dtMatches) {
    if (match[1] in documentedTypes) {
      description = description.replace(match[0], `/api/fhir/datatypes/${match[1].toLowerCase()}`);
    } else {
      description = description.replace(match[0], `https://www.hl7.org/fhir/datatypes.html#${match[1]}`);
    }
  }

  // Replace all the links of [[[Type]]] with internal links
  const typeLinks = Array.from(description.matchAll(/\[\[\[([A-Z][a-z]*)*\]\]\]/gi));
  for (const match of typeLinks) {
    description = description.replace(match[0], `[${match[1]}](./${match[1].toLowerCase()})`);
  }

  return description;
}

async function downloadAndUnzip(downloadURL: string, zipFilePath: string, outputFolder: string): Promise<void> {
  console.info('Downloading FHIR Spec...');
  return new Promise((resolve, reject) => {
    fetch(downloadURL)
      .then((response) => {
        if (!response.ok) {
          reject(new Error(`Error downloading file: ${response.status} ${response.statusText}`));
          return;
        }

        const fileStream = fs.createWriteStream(zipFilePath);
        response.body.pipe(fileStream);

        // Inside your 'downloadAndUnzip' function, replace the extraction part with this:
        fileStream.on('finish', async () => {
          fs.createReadStream(zipFilePath)
            .pipe(unzipper.Parse())
            .on('entry', function (entry) {
              const fileName = entry.path;
              const type = entry.type; // 'Directory' or 'File'
              const fullPath = path.join(outputFolder, fileName).replaceAll('\\', '/');

              if (type === 'Directory') {
                mkdirp.sync(fullPath);
                entry.autodrain();
              } else {
                mkdirp.sync(path.dirname(fullPath));
                entry.pipe(fs.createWriteStream(fullPath));
              }
              console.info('\rDownloading FHIR Spec...');
            })
            .on('close', resolve)
            .on('error', reject);
        });
      })
      .catch(() => {
        reject(new Error('Error downloading or unzipping file'));
      });
  });
}

function extractResourceDescriptions(
  htmlDirectory: string,
  definitions: StructureDefinition[]
): Record<string, Record<string, string | string[] | undefined>> {
  const results: Record<string, Record<string, string | string[] | undefined>> = {};
  console.info('Extracting HTML descriptions...');
  for (const definition of definitions) {
    console.info('\t' + definition.name);
    const resourceType = definition.name?.toLowerCase();
    const fileName = path.resolve(htmlDirectory, `${resourceType}.html`);
    if (resourceType && fs.existsSync(fileName)) {
      const fileContent = fs.readFileSync(fileName, 'utf-8');
      const dom = new JSDOM(fileContent);
      const document = dom.window.document;

      const resourceContents: Record<string, string | string[] | undefined> = { referencedBy: [] };

      // find the divs
      const divs = document.getElementsByTagName('div');
      for (const div of divs) {
        const h2 = div.querySelector('h2');
        if (h2) {
          const h2Text = h2.textContent?.toLowerCase().replace(/\s/g, '') || '';

          const paragraphHTML = sanitizeDivContent(div);

          if (h2Text.includes('scopeandusage')) {
            resourceContents.scopeAndUsage = paragraphHTML;
          } else if (h2Text.includes('backgroundandcontext')) {
            resourceContents.backgroundAndContext = paragraphHTML;
          } else if (h2Text.includes('boundariesandrelationships')) {
            resourceContents.boundariesAndRelationships = paragraphHTML;
          }
        }
      }

      // find referencedBy
      const pElements = document.querySelectorAll('p');
      for (const p of pElements) {
        if (p.textContent?.trim().startsWith('This resource is referenced by')) {
          const aElements = p.querySelectorAll('a');
          const aHrefs = Array.from(aElements).map((a) => a.href);
          resourceContents['referencedBy'] = aHrefs;
        }
      }
      results[resourceType] = resourceContents;
    }
  }

  console.info('\rDone');

  return results;
}

function sanitizeNodeContent(node: HTMLElement): string {
  // Remove img tags.
  const imgElements = node.getElementsByTagName('img');
  for (const img of Array.from(imgElements)) {
    img.parentNode?.removeChild(img);
  }

  // Remove p elements containing the text "Trial-Use Note".
  if (node.nodeName.toLowerCase() === 'p' && node.textContent?.includes('Trial-Use Note')) {
    node.parentNode?.removeChild(node);
  }

  // Remove comment nodes.
  const childNodes = node.childNodes;
  for (const child of Array.from(childNodes)) {
    if (child.nodeType === 8) {
      node.removeChild(child);
    }
  }

  // Replace br tags with closed ones.
  return node.outerHTML.replaceAll('<br>', '<br/>').replace(/[\n\t]/g, ' ');
}

function sanitizeDivContent(div: Element): string {
  let combinedHTML = '';

  // Extract and sanitize p tags.
  const pElements = div.getElementsByTagName('p');
  for (const p of Array.from(pElements)) {
    combinedHTML += sanitizeNodeContent(p);
  }

  // Extract and sanitize tables and their td tags.
  const tableElements = div.getElementsByTagName('table');
  for (const table of Array.from(tableElements)) {
    const tdElements = table.getElementsByTagName('td');
    for (const td of Array.from(tdElements)) {
      td.outerHTML = sanitizeNodeContent(td);
    }
    combinedHTML += table.outerHTML;
  }

  return combinedHTML;
}

async function fetchFhirIntroductions(
  definitions: StructureDefinition[]
): Promise<Record<string, Record<string, string | string[] | undefined>>> {
  const downloadURL = 'http://hl7.org/fhir/R4/fhir-spec.zip';
  const zipFile = path.resolve(__dirname, '..', 'output', 'fhir-spec.zip');
  const outputFolder = path.resolve(__dirname, '..', 'output', 'fhir-spec');
  const siteDir = path.resolve(outputFolder, 'site');
  if (!fs.existsSync(outputFolder)) {
    return downloadAndUnzip(downloadURL, zipFile, outputFolder).then(() => {
      return extractResourceDescriptions(siteDir, definitions);
    });
  } else {
    const results = extractResourceDescriptions(siteDir, definitions);
    return results;
  }
}

function pluralize(location: DocumentationLocation): string {
  if (location !== 'medplum' && location.endsWith('e')) {
    return `${location}s`;
  }
  return location;
}

if (process.argv[1].endsWith('docs.ts')) {
  main().catch(console.error);
}
