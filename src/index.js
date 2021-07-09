#!/usr/bin/env node
const path = require('path');
const fs = require('fs');
const fse = require('fs-extra');
const readDirSync = require('fs-readdir-recursive');
const glob = require('glob');
const {
  rootDir,
  rootPacakgeJson,
  outputFolder,
  workspaceData,
  prodWorkspaces,
  devWorkspaces,
  relatedWorkspaces,
  projectWorkspaces,
  yarnrcDisable,
  yarnrcGenerate,
  yarnLockDisable,
  srcLessDisable,
  srcLessSubDev,
  srcLessGlob,
  srcLessProdDisable,
  srcLessProdGlob,
  jsonFileDisable,
  jsonFileProdDisable,
  srcFilesEnable,
  srcFilesIncludeGlob,
  srcFilesExcludeGlob,
  workspacesExcludeGlob,
  includeRootDeps,
  isolateFolder,
  workspacesFolder,
  srcLessFolder,
  srcLessFolderProd,
  yarnV2,
} = require('./params');
const { createYarnLock } = require('./create-yarn-lock');

const ignorePattterns = ['.', 'package.json', 'node_modules', outputFolder];

function createDestinationFolders() {
  if (fs.existsSync(isolateFolder)) fs.rmdirSync(isolateFolder, { recursive: true });
  fs.mkdirSync(workspacesFolder, { recursive: true });

  if (srcFilesExcludeGlob) {
    const files = glob.sync(srcFilesExcludeGlob, { cwd: workspaceData.location, absolute: true, ignore: ignorePattterns });

    const filesToCopy = readDirSync(
      workspaceData.location,
      (name, i, dir) => !ignorePattterns.includes(name) && !files.includes(`${dir}/${name}`),
    );

    filesToCopy.forEach(file =>
      fse.copySync(path.join(workspaceData.location, file), path.join(isolateFolder, file), { preserveTimestamps: true }),
    );
  } else if (srcFilesIncludeGlob) {
    const files = glob.sync(srcFilesIncludeGlob, { cwd: workspaceData.location, absolute: true, ignore: ignorePattterns });

    files.forEach(file =>
      fse.copySync(file, path.join(isolateFolder, path.relative(workspaceData.location, file)), { preserveTimestamps: true }),
    );
  } else if (srcFilesEnable) {
    const filesToCopy = readDirSync(workspaceData.location, name => !ignorePattterns.includes(name));
    filesToCopy.forEach(file =>
      fse.copySync(path.join(workspaceData.location, file), path.join(isolateFolder, file), { preserveTimestamps: true }),
    );
  }
}

function resolveWorkspacesNewLocation() {
  relatedWorkspaces.forEach(name => {
    const subWorkspace = projectWorkspaces[name];
    const relativePath = path.relative(rootDir, subWorkspace.location);
    subWorkspace.newLocation = path.join(workspacesFolder, relativePath);

    subWorkspace.pkgJsonLocation = path.join(subWorkspace.newLocation, 'package.json');
    fs.mkdirSync(subWorkspace.newLocation, { recursive: true });

    if (!srcLessSubDev) subWorkspace.pkgJson.devDependencies = {};
    fs.writeFileSync(subWorkspace.pkgJsonLocation, JSON.stringify(subWorkspace.pkgJson, null, 2));

    const files = workspacesExcludeGlob
      ? glob.sync(workspacesExcludeGlob, { cwd: subWorkspace.location, absolute: true, ignore: ignorePattterns })
      : [];

    const filesToCopy = readDirSync(
      subWorkspace.location,
      (name, i, dir) => !ignorePattterns.includes(name) && !files.includes(`${dir}/${name}`),
    );

    filesToCopy.forEach(file =>
      fse.copySync(path.join(subWorkspace.location, file), path.join(subWorkspace.newLocation, file), {
        preserveTimestamps: true,
      }),
    );
  });
}

function copySrcLessToNewLocation() {
  if (!srcLessDisable) {
    fs.mkdirSync(srcLessFolder, { recursive: true });
    relatedWorkspaces.forEach(name => {
      const subWorkspace = projectWorkspaces[name];
      const relativePath = path.relative(rootDir, subWorkspace.location);
      const subWorkspaceSrcLessFolder = path.join(srcLessFolder, relativePath);
      fs.mkdirSync(subWorkspaceSrcLessFolder, { recursive: true });

      fs.writeFileSync(path.join(subWorkspaceSrcLessFolder, 'package.json'), JSON.stringify(subWorkspace.pkgJson, null, 2), {
        flag: 'wx',
      });
      if (srcLessGlob) {
        const files = glob.sync(srcLessGlob, { cwd: subWorkspace.location, absolute: true, ignore: ignorePattterns });

        files.forEach(file =>
          fse.copySync(file, path.join(subWorkspaceSrcLessFolder, path.relative(subWorkspace.location, file)), {
            preserveTimestamps: true,
          }),
        );
      }
    });
  }
}

function copySrcLessProdToNewLocation() {
  if (!srcLessProdDisable) {
    fs.mkdirSync(srcLessFolderProd, { recursive: true });
    prodWorkspaces.forEach(name => {
      const subWorkspace = projectWorkspaces[name];
      const relativePath = path.relative(rootDir, subWorkspace.location);
      const subWorkspaceSrcLessProdFolder = path.join(srcLessFolderProd, relativePath);
      fs.mkdirSync(subWorkspaceSrcLessProdFolder, { recursive: true });

      fs.writeFileSync(path.join(subWorkspaceSrcLessProdFolder, 'package.json'), JSON.stringify(subWorkspace.pkgJson, null, 2), {
        flag: 'wx',
      });

      if (srcLessProdGlob) {
        const files = glob.sync(srcLessProdGlob, { cwd: subWorkspace.location, absolute: true, ignore: ignorePattterns });

        files.forEach(file =>
          fse.copySync(file, path.join(subWorkspaceSrcLessProdFolder, path.relative(subWorkspace.location, file)), {
            preserveTimestamps: true,
          }),
        );
      }
    });
  }
}

function createMainJsonFile() {
  workspaceData.pkgJson.workspaces = prodWorkspaces.map(name => path.relative(isolateFolder, projectWorkspaces[name].newLocation));

  let currentDevDependencies = {};

  if (workspaceData.pkgJson.devDependencies) {
    currentDevDependencies = JSON.parse(JSON.stringify(workspaceData.pkgJson.devDependencies));

    if (includeRootDeps) {
      currentDevDependencies = {
        ...rootPacakgeJson.devDependencies,
        ...currentDevDependencies,
      };
    }
  }

  if (includeRootDeps) {
    workspaceData.pkgJson.dependencies = {
      ...rootPacakgeJson.dependencies,
      ...workspaceData.pkgJson.dependencies,
    };
  }
  if (yarnV2) {
    // Fix dependencies to other workspaces
    for (const dep in workspaceData.pkgJson.dependencies) {
      const workspace = projectWorkspaces[dep];
      if (workspace) {
        workspaceData.pkgJson.dependencies[dep] = `workspace:${path.relative(isolateFolder, workspace.newLocation)}`;
      }
    }
  }

  if (!jsonFileProdDisable) {
    workspaceData.pkgJson.devDependencies = {};
    fs.writeFileSync(path.join(isolateFolder, 'package-prod.json'), JSON.stringify(workspaceData.pkgJson, null, 2));
  }

  workspaceData.pkgJson.devDependencies = currentDevDependencies;
  workspaceData.pkgJson.workspaces.push(
    ...devWorkspaces.map(name => path.relative(isolateFolder, projectWorkspaces[name].newLocation)),
  );

  // Copy custom resolutions from root package. Ours have priority
  if (rootPacakgeJson.resolutions) {
    workspaceData.pkgJson.resolutions = { ...rootPacakgeJson.resolutions, ...workspaceData.pkgJson.resolutions };
  }

  if (!jsonFileDisable) {
    fs.writeFileSync(path.join(isolateFolder, 'package.json'), JSON.stringify(workspaceData.pkgJson, null, 2));
  }
}

function createYarnRc() {
  if (yarnrcDisable) return;
  if (yarnV2) {
    const yarnrcFileSrc = path.join(rootDir, '.yarnrc.yml');
    const yarnrcFileDest = path.join(isolateFolder, '.yarnrc.yml');
    if (yarnrcGenerate) {
      throw new Error('Generating a .yarn.yml file for Yarn v2 is unsupported at the moment');
    }
    if (!fs.existsSync(yarnrcFileSrc)) {
      throw new Error(`${yarnrcFileSrc} does not exist`);
    }
    fs.copyFileSync(yarnrcFileSrc, yarnrcFileDest);
    const yarnFolderSrc = path.join(rootDir, '.yarn');
    const yarnFolderDest = path.join(isolateFolder, '.yarn');
    const files = glob.sync('{releases,plugins}/*', { cwd: yarnFolderSrc, absolute: true, ignore: ignorePattterns });
    files.forEach(file =>
      fse.copySync(file, path.join(yarnFolderDest, path.relative(workspaceData.location, file)), { preserveTimestamps: true }),
    );
  } else {
    const yarnrcFileSrc = path.join(rootDir, '.yarnrc');
    const yarnrcFileDest = path.join(isolateFolder, '.yarnrc');
    if (!yarnrcGenerate && fs.existsSync(yarnrcFileSrc)) {
      fs.copyFileSync(yarnrcFileSrc, yarnrcFileDest);
      return;
    }
    fs.writeFileSync(yarnrcFileDest, 'workspaces-experimental true');
  }
}

async function start() {
  createDestinationFolders();
  resolveWorkspacesNewLocation();
  copySrcLessToNewLocation();
  copySrcLessProdToNewLocation();
  createMainJsonFile();
  createYarnRc();
  createYarnLock({ yarnLockDisable, rootDir, projectWorkspaces, srcLessSubDev, workspaceData, isolateFolder, yarnV2 });
}

start();
