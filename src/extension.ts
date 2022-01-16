import * as vscode from 'vscode';
import * as cp from "child_process";

let currentCodegenVersion: string;
let lastCodegenVersion: string;
let projectCodegenVersion: string;
let codegenStatusBarItem: vscode.StatusBarItem;

const execShell = (cmd: string) =>
    new Promise<string>((resolve, reject) => {
        cp.exec(cmd, (err, out) => {
            if (err) {
                return reject(err);
            }
            return resolve(out);
        });
});

async function getLastVersion() {
	let outDated = (await execShell('pip list --outdated ')).match(/.*id3codegen.*/g);
	if(outDated) {
		let lastVersion = outDated[0].match(/\d.\d.\d/g);
		if(lastVersion) {
			return lastVersion[1];
		}
	}
	return currentCodegenVersion;
}

async function getCurrentVersion() {
	let localVersion = (await execShell('pip show id3codegen')).match(/\d.\d.\d/g);
	if(localVersion) {
		codegenStatusBarItem.text = 'codegen v' + localVersion[0];
		return localVersion[0];
	}
	return "Not installed";
}

async function getProjectVersion() {
	let rootWorkspaces = vscode.workspace.workspaceFolders?.map(folder => folder.uri.path);
	if(rootWorkspaces?.length === 1) {
		let uri = vscode.Uri.file(rootWorkspaces[0]+'/codegen/codegen_version.txt');
		let doc = await vscode.workspace.openTextDocument(uri);
		let projectVersion = doc.getText().match(/\d.\d.\d/g);
		if(projectVersion) {
			return projectVersion[0];
		}
	}
	return "N/A";
}

async function updateCodegen() {
	vscode.window.showInformationMessage('Updating codegen to v' + lastCodegenVersion + '...');
	await execShell('pip install -U id3codegen');
	currentCodegenVersion = await getCurrentVersion();
	vscode.window.showInformationMessage('Successfully updated codegen to v' + currentCodegenVersion + '!');
}

async function runCodegen() {
	let json = await vscode.workspace.findFiles('codegen/*.json');
	if(json.length === 1) {
		const terminal = vscode.window.createTerminal();
		terminal.show();
    	terminal.sendText('codegen --root_dir . --json_file_path '+ json[0].fsPath);
	}
}

export async function activate({ subscriptions }: vscode.ExtensionContext) {
	codegenStatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 0);

	currentCodegenVersion = await getCurrentVersion();
	codegenStatusBarItem.command = 'extension.runCodegen';
	codegenStatusBarItem.text = 'codegen v' + currentCodegenVersion;
	subscriptions.push(codegenStatusBarItem);
	codegenStatusBarItem.show();

	lastCodegenVersion = await getLastVersion();
	if(lastCodegenVersion !== currentCodegenVersion) {
		vscode.window.showWarningMessage('A new version of codegen is available : v'+lastCodegenVersion, ...['Update']).then(selection => {
			updateCodegen();
		});
	}

	projectCodegenVersion = await getProjectVersion();
	if(projectCodegenVersion !== "N/A" && projectCodegenVersion !== currentCodegenVersion) {
		vscode.window.showWarningMessage('This project present an out-dated codegen API : v'+projectCodegenVersion, ...['Run codegen']).then(selection => {
			runCodegen();
		});
	}

	let disposableRunCodegen = vscode.commands.registerCommand('extension.runCodegen', async () => {
		runCodegen();
	});
	subscriptions.push(disposableRunCodegen);
}

export function deactivate() {}
