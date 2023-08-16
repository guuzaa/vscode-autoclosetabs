import * as vscode from "vscode";
import {
	closeTabs,
	incrementTabTimeCounter,
	removeTabTimeCounter,
	resetTabTimeCounter,
} from "./autoclosetabs";
import { INTERVAL_IN_MINUTES, log } from "./common";
import { getSettingValue, updateSettingValue } from "./settings";

let interval: ReturnType<typeof setInterval>;

const getWorkspaceUri = (): string | null => {
	const workspaceFileUri = vscode.workspace.workspaceFile?.toString();

	if (workspaceFileUri && !workspaceFileUri.startsWith("untitled:")) {
		log(`Workspace file URI is ${workspaceFileUri}`);
		return workspaceFileUri;
	}

	const workspaceFolders = vscode.workspace.workspaceFolders;

	if (workspaceFolders?.length === 1) {
		const workspaceFolderUri = workspaceFolders[0].uri.toString();
		log(`Workspace folder URI is ${workspaceFolderUri}`);
		return workspaceFolderUri;
	}

	log("No permanent workspace URI");

	return null;
};

const isActiveByDefault = () =>
	getSettingValue("autoclosetabs.activation") !== "nowhere-except-included";

const activateInWorkspace = () => {
	const workspaceUri = getWorkspaceUri();

	if (!workspaceUri) {
		vscode.window.showInformationMessage(
			"Auto Close Tabs cannot be activated in a temporary workspace.",
		);
		return;
	}

	if (isActiveByDefault()) {
		const settingSection = "autoclosetabs.excludedWorkspaces";

		const excludedWorkspaces = getSettingValue(settingSection);

		updateSettingValue(
			settingSection,
			excludedWorkspaces.filter(
				(excludedWorkspace) => excludedWorkspace !== workspaceUri,
			),
		);
	} else {
		const settingSection = "autoclosetabs.includedWorkspaces";

		const includedWorkspaces = getSettingValue(settingSection);

		updateSettingValue(settingSection, [...includedWorkspaces, workspaceUri]);
	}
};

const deactivateInWorkspace = () => {
	const workspaceUri = getWorkspaceUri();

	if (!workspaceUri) {
		vscode.window.showInformationMessage(
			"Auto Close Tabs cannot be deactivated in a temporary workspace.",
		);
		return;
	}

	if (isActiveByDefault()) {
		const settingSection = "autoclosetabs.excludedWorkspaces";

		const excludedWorkspaces = getSettingValue(settingSection);

		updateSettingValue(settingSection, [...excludedWorkspaces, workspaceUri]);
	} else {
		const settingSection = "autoclosetabs.includedWorkspaces";

		const includedWorkspaces = getSettingValue(settingSection);

		updateSettingValue(
			settingSection,
			includedWorkspaces.filter(
				(includedWorkspace) => includedWorkspace !== workspaceUri,
			),
		);
	}
};

const registerCommands = (context: vscode.ExtensionContext) => {
	context.subscriptions.push(
		vscode.commands.registerCommand("autoclosetabs.closeUnusedTabs", () =>
			closeTabs(0, context),
		),
	);

	context.subscriptions.push(
		vscode.commands.registerCommand("autoclosetabs.activate", () =>
			activateInWorkspace(),
		),
	);

	context.subscriptions.push(
		vscode.commands.registerCommand("autoclosetabs.deactivate", () =>
			deactivateInWorkspace(),
		),
	);
};

const isActiveInWorkspace = (): boolean => {
	const workspaceUri = getWorkspaceUri();

	if (isActiveByDefault()) {
		if (!workspaceUri) {
			return true;
		}

		const excludedWorkspaces = getSettingValue(
			"autoclosetabs.excludedWorkspaces",
		);

		return !excludedWorkspaces.includes(workspaceUri);
	} else {
		if (!workspaceUri) {
			return false;
		}

		const includedWorkspaces = getSettingValue(
			"autoclosetabs.includedWorkspaces",
		);

		return includedWorkspaces.includes(workspaceUri);
	}
};

const setActiveInWorkspaceState = () =>
	vscode.commands.executeCommand(
		"setContext",
		"autoclosetabs.activeInWorkspace",
		isActiveInWorkspace(),
	);

export function activate(context: vscode.ExtensionContext) {
	registerCommands(context);
	setActiveInWorkspaceState();

	context.subscriptions.push(
		vscode.workspace.onDidChangeConfiguration(({ affectsConfiguration }) => {
			if (
				affectsConfiguration("autoclosetabs.activation") ||
				affectsConfiguration("autoclosetabs.excludedWorkspaces") ||
				affectsConfiguration("autoclosetabs.includedWorkspaces")
			) {
				setActiveInWorkspaceState();
			}
		}),
	);

	vscode.window.tabGroups.all.forEach((tabGroup) =>
		tabGroup.tabs.forEach((tab) => resetTabTimeCounter(tab, context)),
	);

	context.subscriptions.push(
		vscode.window.tabGroups.onDidChangeTabs(({ opened, changed, closed }) => {
			[...opened, ...changed].forEach((tab) =>
				resetTabTimeCounter(tab, context),
			);
			closed.forEach((tab) => removeTabTimeCounter(tab, context));
		}),
	);

	interval = setInterval(
		() => {
			vscode.window.tabGroups.all.forEach((tabGroup) =>
				tabGroup.tabs.forEach((tab) => incrementTabTimeCounter(tab, context)),
			);

			if (isActiveInWorkspace()) {
				closeTabs(
					getSettingValue("autoclosetabs.tabAgeForAutomaticClosing"),
					context,
				);
			}
		},
		INTERVAL_IN_MINUTES * 60 * 1000,
	);
}

// This is not called when testing with the .vsix file; I hope it will be with the published extension
export function deactivate() {
	log("Deactivate autoclosetabs");
	log(interval);
	clearInterval(interval);
}
