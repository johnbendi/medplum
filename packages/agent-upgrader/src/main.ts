import { Logger, normalizeErrorString } from '@medplum/core';
import { execSync } from 'node:child_process';
import { createWriteStream, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { platform } from 'node:os';
import { resolve } from 'node:path';
import { Readable } from 'node:stream';

let osString: SupportedOs;

type ReleaseManifest = { tag_name: string; assets: { name: string; browser_download_url: string }[] };
type SupportedOs = 'windows' | 'linux';

const UPGRADE_MANIFEST_PATH = resolve(__dirname, '../../agent/src/upgrade.json');
const GITHUB_RELEASES_URL = 'https://api.github.com/repos/medplum/medplum/releases';
const RELEASES_PATH = resolve(__dirname);

const globalLogger = new Logger((msg) => console.log(msg));

let releaseManifest: ReleaseManifest;

async function main(argv: string[]): Promise<void> {
  switch (platform()) {
    case 'win32':
      osString = 'windows';
      break;
    case 'linux':
      osString = 'linux';
      break;
    default:
      throw new Error(`Unsupported platform: ${platform()}`);
  }

  // TODO: Remove this when Linux auto-update is supported
  if (osString === 'linux') {
    throw new Error('Auto-upgrading is not currently supported for Linux');
  }

  // NOTE: Windows past this point, for now

  // Make sure if version is given, it matches semver
  if (argv[2] && !/\d+\.\d+\.\d+/.test(argv[2])) {
    throw new Error('Invalid version specified');
  }
  const version = argv[2] ?? (await fetchLatestVersionString());
  // If we are upgrading to latest version, record what version we are upgrading to in `upgrade.json` for comparison after the new version restarts
  if (!argv[2]) {
    if (!existsSync(UPGRADE_MANIFEST_PATH)) {
      throw new Error('`upgrade.json` is missing. Unable to upgrade');
    }
    const upgradeFile = readFileSync(UPGRADE_MANIFEST_PATH, { encoding: 'utf-8' });
    const manifest = JSON.parse(upgradeFile) as { previousVersion: string; targetVersion: string };
    if (manifest.targetVersion === 'latest') {
      manifest.targetVersion = version;
      writeFileSync(UPGRADE_MANIFEST_PATH, JSON.stringify(manifest), { encoding: 'utf-8' });
    }
  }
  const binPath = getReleaseBinPath(version);

  // If release in not locally downloaded, download it first
  if (!existsSync(binPath)) {
    // Download release
    await downloadRelease(version, binPath);
  }

  try {
    // Stop service
    execSync('net stop "Medplum Agent"');
    // Run installer
    execSync(`${binPath} /S`);
  } catch (err: unknown) {
    // Try to restart Agent service if anything goes wrong
    globalLogger.error('Failed to run installer, attempting to restart agent service...');
    execSync('net start "Medplum Agent"');
    throw err;
  }
}

async function fetchLatestVersionString(): Promise<string> {
  const latest = await fetchVersionManifest();
  if (!latest.tag_name.startsWith('v')) {
    throw new Error(`Invalid release name found. Release tag '${latest.tag_name}' did not start with 'v'`);
  }
  return latest.tag_name.slice(1);
}

async function downloadRelease(version: string, path: string): Promise<void> {
  const release = await fetchVersionManifest(version);

  // Get download url
  const downloadUrl = parseDownloadUrl(release, osString);

  // Write file to RELEASE_INSTALLER_FOLDER
  const { body } = await fetch(downloadUrl);
  if (!body) {
    throw new Error('Body not present on Response');
  }

  // @ts-expect-error Slight type mismatch
  const readable = Readable.fromWeb(body);
  const writeStream = readable.pipe(createWriteStream(path));

  return new Promise<void>((resolve) => {
    writeStream.once('close', resolve);
  });
}

/**
 * @param version - The version to fetch. If no `version` is provided, defaults to the `latest` version.
 * @returns - The manifest for the specified or latest version.
 */
async function fetchVersionManifest(version?: string): Promise<ReleaseManifest> {
  if (!releaseManifest) {
    const res = await fetch(`${GITHUB_RELEASES_URL}/${version ? `tags/v${version}` : 'latest'}`);
    releaseManifest = (await res.json()) as ReleaseManifest;
    if (!releaseManifest) {
      throw new Error(version ? `No release found with tag v${version}` : 'No releases found in repo');
    }
  }
  return releaseManifest;
}

function parseDownloadUrl(release: ReleaseManifest, os: SupportedOs): string {
  let endingToMatch: string;
  switch (os) {
    case 'windows':
      endingToMatch = '.exe';
      break;
    case 'linux':
      endingToMatch = 'linux';
      break;
    default:
      throw new Error('Invalid OS');
  }
  for (const asset of release.assets) {
    if (asset.name.endsWith(endingToMatch)) {
      return asset.browser_download_url;
    }
  }
  throw new Error(`No download URL found for release '${release.tag_name}' for ${os}`);
}

function getReleaseBinPath(version: string): string {
  let binaryName: string;
  switch (osString) {
    case 'windows':
      binaryName = `medplum-agent-installer-${version}.exe`;
      break;
    case 'linux':
      binaryName = `medplum-agent-${version}-linux`;
      break;
  }
  return resolve(RELEASES_PATH, binaryName);
}

if (typeof require !== 'undefined' && require.main === module) {
  main(process.argv).catch((err) => globalLogger.error(normalizeErrorString(err)));
}
