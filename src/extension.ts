import * as vscode from 'vscode';
import * as cp from "child_process";
import { openStdin } from 'process';

let currentCodegenVersion: string;
let lastCodegenVersion: string;
let projectCodegenVersion: string;
let codegenStatusBarItem: vscode.StatusBarItem;
let pipCmd: string;
let newVersion: boolean;
let installed: boolean;
let timer: NodeJS.Timer;

const execShell = (cmd: string) =>
    new Promise<string>((resolve, reject) => {
        cp.exec(cmd, (err, out) => {
            if (err) {
                return resolve(err.message);
            }
            return resolve(out);
        });
});

async function getLastVersion() {
	let cmd_ret = await execShell(pipCmd + ' list --outdated ');
	if(!cmd_ret.includes('failed')) {
		let outDated = cmd_ret.match(/.*id3codegen.*/g);
		if(outDated) {
			let lastVersion = outDated[0].match(/\d{1,}.\d{1,}.\d{1,}/g);
			if(lastVersion) {
				return lastVersion[1];
			}
		}
	}
	return 'N/A';
}

async function getCurrentVersion() {
	let cmd_ret = await execShell(pipCmd + ' show id3codegen');
	if(cmd_ret.includes('failed')) {
		vscode.window.showWarningMessage('Codegen is not installed.', ...['Install']).then(selection => {
			installCodegen();
		});
	} else {
		let localVersion = cmd_ret.match(/\d{1,}.\d{1,}.\d{1,}/g);
		if(localVersion) {
			installed = true;
			codegenStatusBarItem.text = 'codegen v' + localVersion[0];
			return localVersion[0];
		}
	}
	return "Not installed";
}

async function getProjectVersion() {
	let rootWorkspaces = vscode.workspace.workspaceFolders?.map(folder => folder.uri.path);
	if(rootWorkspaces?.length === 1) {
		let uri = vscode.Uri.file(rootWorkspaces[0]+'/codegen/codegen_version.txt');
		let doc = await vscode.workspace.openTextDocument(uri);
		let projectVersion = doc.getText().match(/\d{1,}.\d{1,}.\d{1,}/g);
		if(projectVersion) {
			return projectVersion[0];
		}
	}
	return 'N/A';
}

async function installCodegen() {
	let cmd_ret = await execShell(pipCmd + ' install id3codegen');
	if(!cmd_ret.includes('failed')) {
		currentCodegenVersion = await getCurrentVersion();
		vscode.window.showInformationMessage('Successfully updated codegen to v' + currentCodegenVersion + '!');
		installed = true;
		setUpdateTimer();
		checkProjectUpToDate();
	} else {
		vscode.window.showErrorMessage('Error during codegen install. Please run "pip install id3codegen" manually.');
	}
}

async function updateCodegen() {
	let cmd_ret = await execShell(pipCmd + ' install -U id3codegen');
	if(!cmd_ret.includes('failed')) {
		currentCodegenVersion = await getCurrentVersion();
		vscode.window.showInformationMessage('Successfully updated codegen to v' + currentCodegenVersion + '!', ...['See Changelog']).then(selection => {
			if(selection === 'See Changelog') {
				vscode.env.openExternal(vscode.Uri.parse('https://gitlab.srv.int.id3.eu/biometrics/algos/development/codegen/-/blob/' + currentCodegenVersion + '/CHANGELOG.md'));
			}
		});
		newVersion = false;
		checkProjectUpToDate();
	} else {
		vscode.window.showErrorMessage('Error during codegen update. Please run "pip install -U id3codegen" manually.');
	}
}

function runCmdInTerm(root_dir:String, json_path:String) {
	let terminal;
		if(vscode.window.terminals.length == 0) {
			terminal = vscode.window.createTerminal();
		} else {
			terminal = vscode.window.activeTerminal;
			if(terminal === undefined) {
				terminal = vscode.window.createTerminal();
			}
		}
		terminal.show();
    	terminal.sendText('codegen --root_dir ' + root_dir + ' --json_file_path '+ json_path);
}


async function runCodegen() {
	let json = await vscode.workspace.findFiles('codegen/*.json');
	let root = '.';
	if(vscode.workspace.workspaceFolders != undefined) {
		root = vscode.workspace.workspaceFolders[0].uri.fsPath;
	}
	if(json.length <= 0) {
		vscode.window.showErrorMessage('No JSON API file found in codegen directory');
	} else if(json.length === 1) {
		runCmdInTerm(root,json[0].fsPath)
	} else {
		let paths: Array<string> = []
		json.forEach(element => paths.push(element.fsPath));
		const result = await vscode.window.showQuickPick(paths, {
			placeHolder: 'Choose which JSON API file you want to run:'
		});
		if(result != undefined) {
			runCmdInTerm(root,result)
		}
	}
}

async function checkForUpdate() {
	lastCodegenVersion = await getLastVersion();
	if(lastCodegenVersion !== currentCodegenVersion && lastCodegenVersion !== 'N/A') {
		newVersion = true;
		vscode.window.showWarningMessage('A new version of codegen is available : v'+lastCodegenVersion, ...['Update']).then(selection => {
			if(selection === 'Update') {
				updateCodegen();
			}
		});
	}
}

async function checkProjectUpToDate() {
	projectCodegenVersion = await getProjectVersion();
	if(projectCodegenVersion !== "N/A" && projectCodegenVersion !== currentCodegenVersion) {
		vscode.window.showWarningMessage('This project present an out-dated codegen API : v'+projectCodegenVersion, ...['Run codegen']).then(selection => {
			if(selection === 'Run codegen') {
				runCodegen();
			}
		});
	}
}

function getPipCmd() {
	const os = require('os');
	let osName = os.platform();
	if(osName === 'linux' || osName === 'darwin')  {
		return 'python3 -m pip';
	} else {
		return 'python -m pip';
	}
}

async function checkVersions() {
	await checkForUpdate();
	if(! newVersion) {
		checkProjectUpToDate();
	}
}

function setUpdateTimer() {
	timer = setInterval(() => checkVersions(),1000*60*10); // check every 10min
}

export async function activate({ subscriptions }: vscode.ExtensionContext) {
	installed = false;
	pipCmd = getPipCmd();
	codegenStatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 0);
	codegenStatusBarItem.command = 'extension.runCodegen';
	subscriptions.push(codegenStatusBarItem);

	let disposableRunCodegen = vscode.commands.registerCommand('extension.runCodegen', async () => {
		runCodegen();
	});
	subscriptions.push(disposableRunCodegen);

	currentCodegenVersion = await getCurrentVersion();
	if(installed) {
		codegenStatusBarItem.text = 'codegen v' + currentCodegenVersion;
		codegenStatusBarItem.show();
		checkVersions();
		setUpdateTimer();
	} else {
		codegenStatusBarItem.text = 'codegen not installed';
		codegenStatusBarItem.show();
	}
}

export function deactivate() {}
