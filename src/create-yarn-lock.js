const path = require('path');
const fs = require('fs');
const lockfile = require('@yarnpkg/lockfile');
const jsYaml = require('js-yaml');

module.exports.createYarnLock = ({
  yarnLockDisable,
  rootDir,
  projectWorkspaces,
  srcLessSubDev,
  workspaceData,
  isolateFolder,
  yarnV2,
}) => {
  if (yarnLockDisable) return;
  const yarnLockPath = path.join(rootDir, 'yarn.lock');
  if (!fs.existsSync(yarnLockPath)) {
    console.warn('no yarn.lock file on project root');
    return;
  }

  let oldFile = yarnV2
    ? jsYaml.load(fs.readFileSync(yarnLockPath, 'utf8'), {
        schema: jsYaml.FAILSAFE_SCHEMA,
        json: true,
      })
    : lockfile.parse(fs.readFileSync(yarnLockPath, 'utf8')).object;

  function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // $& means the whole matched string
  }

  function getDependency(name, version) {
    if (yarnV2) {
      if (workspaceData.pkgJson.resolutions && workspaceData.pkgJson.resolutions[name]) {
        version = workspaceData.pkgJson.resolutions[name];
      }
      let matchingDeps = Object.keys(oldFile).filter(d => d.startsWith(name + '@'));
      let matchingVersion = matchingDeps.filter(d =>
        d.split(', ').find(n => n.match(new RegExp(`^.*(@|:)${escapeRegExp(version)}$`))),
      );
      if (matchingVersion.length > 1) {
        throw new Error(`More than one matching dep for ${name}:${version}`);
      }
      return matchingVersion[0];
    } else {
      return `${name}@${version}`;
    }
  }

  const dependenciesList = (function getDependencies() {
    const list = [];
    const recursive = (dependencies = {}) => {
      Object.entries(dependencies).forEach(([name, version]) => {
        if (!projectWorkspaces[name]) {
          const depName = getDependency(name, version);
          if (depName) {
            if (!list.includes(depName)) {
              list.push(depName);
              if (oldFile[depName] && oldFile[depName].dependencies) {
                recursive(oldFile[depName].dependencies);
              }
            }
          } else {
            throw new Error(`Could not find ${name}:${version}`);
          }
        } else {
          if (srcLessSubDev) {
            recursive({ ...projectWorkspaces[name].pkgJson.dependencies, ...projectWorkspaces[name].pkgJson.devDependencies });
          } else {
            recursive(projectWorkspaces[name].pkgJson.dependencies);
          }
        }
      });
    };
    recursive({ ...workspaceData.pkgJson.dependencies, ...workspaceData.pkgJson.devDependencies });
    return list;
  })();

  const requireDeps = Object.keys(oldFile).filter(name => dependenciesList.includes(name));

  let newFile = requireDeps.reduce((acc, key) => {
    acc[key] = oldFile[key];
    return acc;
  }, {});

  function copyWorkspaceWithDeps(workspaceNode) {
    const deps = workspaceNode.dependencies;
    for (const depName in deps) {
      const workspaceMeta = projectWorkspaces[depName];
      if (workspaceMeta) {
        deps[depName] = `workspace:workspaces/${workspaceMeta.relativeLocation}`;
        newFile[`${depName}@workspace:workspaces/${workspaceMeta.relativeLocation}`] = {
          ...oldFile[`${depName}@workspace:${workspaceMeta.relativeLocation}`],
        };
        copyWorkspaceWithDeps(newFile[`${depName}@workspace:workspaces/${workspaceMeta.relativeLocation}`]);
      }
    }
  }

  let newLock;
  if (yarnV2) {
    // Copy lock metadata
    newFile.__metadata = oldFile.__metadata;
    newFile[`${workspaceData.name}@workspace:.`] = {
      ...oldFile[`${workspaceData.name}@workspace:${workspaceData.relativeLocation}`],
    };

    // Copy actual workspace entry
    copyWorkspaceWithDeps(newFile[`${workspaceData.name}@workspace:.`]);

    newLock = jsYaml.dump(newFile, {
      lineWidth: -1,
      quotingType: '"',
      sortKeys: true,
    });
  } else {
    newLock = lockfile.stringify(newFile);
  }
  fs.writeFileSync(path.join(isolateFolder, 'yarn.lock'), newLock);
  return newLock;
};
