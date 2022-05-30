import { INativeService } from "../interfaces/i-native-service";
import { constants } from "../models/constants";
import { Repository } from "./repository";
import { LoggedEntry, LogLevel, LogService } from "./log-service";

export class ExecuteService {
  constructor(private nativeService: INativeService, private repository: Repository, private logService: LogService) {}

  getQuote(): string {
    return this.nativeService.process.platform === "darwin" ? "'" : "";
  }

  /**
   * Execute a command: if the command contains sudo the system launch it with sudo prompt.
   * Note: with the current version of Electron the sandbox option for Chromium don't allow for sudo prompt on Ubuntu machines 16+
   * Remove the note whenever a fix is found.
   *
   * @param command - the command to launch
   * @param env - environment
   * @returns an {Promise<string>} stdout or stderr
   */
  execute(command: string, env?: any): Promise<string> {
    return new Promise((resolve, reject) => {
      let exec = this.nativeService.exec;
      if (command.startsWith("sudo")) {
        exec = this.nativeService.sudo.exec;
        command = command.substring(5, command.length);
      }

      if (this.nativeService.process.platform === "darwin") {
        if (command.indexOf("osascript") === -1) {
          command = "/usr/local/bin/" + command;
        } else {
          command = "/usr/bin/" + command;
        }
      }

      exec(command, { env, name: "Leapp-" + new Date().toDateString(), timeout: 60000 }, (err, stdout, stderr) => {
        const output = { error: err, stdout, stderr };
        this.logService.log(new LoggedEntry("execute from Leapp: " + JSON.stringify(output), this, LogLevel.info, false));
        if (err) {
          reject(err);
        } else {
          resolve(stdout ? stdout : stderr);
        }
      });
    });
  }

  /**
   * Open a command terminal and launch a generic command
   *
   * @param command - the command to launch in terminal
   * @param env - optional the environment object we can set to pass environment variables
   * @param macOsTerminalType - optional to override terminal type selection on macOS
   * @returns an {Promise<string>} stdout or stderr
   */
  openTerminal(command: string, env?: any, macOsTerminalType?: string): Promise<string> {
    const newEnv = Object.assign({}, this.nativeService.process.env);

    if (this.nativeService.process.platform === "darwin") {
      const terminalType = macOsTerminalType ?? this.repository.getWorkspace().macOsTerminal;
      if (terminalType === constants.macOsTerminal) {
        return this.execute(
          `osascript -e 'if application "Terminal" is running then\n
                    \ttell application "Terminal"\n
                    \t\tdo script "export AWS_SESSION_TOKEN=${env.AWS_SESSION_TOKEN}"\n
                    \t\tdelay 0.5\n
                    \t\tactivate\n
                    \t\tdelay 0.5\n
                    \t\tdo script "export AWS_SECRET_ACCESS_KEY=\\"${env.AWS_SECRET_ACCESS_KEY}\\"" in window 1\n
                    \t\tdelay 0.5\n
                    \t\tdo script "export AWS_ACCESS_KEY_ID=${env.AWS_ACCESS_KEY_ID}" in window 1\n
                    \t\tdelay 0.5\n
                    \t\tdo script "clear" in window 1\n
                    \t\tdelay 0.5\n
                    \t\tdo script "${command} && unset AWS_SESSION_TOKEN && unset AWS_SECRET_ACCESS_KEY && unset AWS_ACCESS_KEY_ID" in window 1\n
                    \tend tell\n
                    else\n
                    \ttell application "Terminal"\n
                    \t\tdo script "${command} && unset AWS_SESSION_TOKEN && unset AWS_SECRET_ACCESS_KEY && unset AWS_ACCESS_KEY_ID" in window 1\n
                    \t\tactivate\n
                    \tend tell\n
                    end if'`,
          Object.assign(newEnv, env)
        );
      } else {
        return this.execute(
          `osascript -e 'tell app "iTerm"\n
                     \tset newWindow to (create window with default profile)\n
                     \ttell current session of newWindow\n
                     \t\twrite text "export AWS_SESSION_TOKEN=${env.AWS_SESSION_TOKEN}"\n
                     \t\tdelay 0.5\n
                     \t\twrite text "export AWS_SECRET_ACCESS_KEY=\\"${env.AWS_SECRET_ACCESS_KEY}\\""\n
                     \t\tdelay 0.5\n
                     \t\twrite text "export AWS_ACCESS_KEY_ID=${env.AWS_ACCESS_KEY_ID}"\n
                     \t\tdelay 0.5\n
                     \t\twrite text "clear"\n
                     \t\tdelay 0.5\n
                     \t\twrite text "${command} && unset AWS_SESSION_TOKEN && unset AWS_SECRET_ACCESS_KEY && unset AWS_ACCESS_KEY_ID"\n
                     \tend tell\n
                     end tell'`,
          Object.assign(newEnv, env)
        );
      }
    } else if (this.nativeService.process.platform === "win32") {
      return this.execute(`start cmd /k ${command}`, env);
    } else {
      return this.execute(`gnome-terminal -- sh -c "${command}; bash"`, Object.assign(newEnv, env));
    }
  }
}
