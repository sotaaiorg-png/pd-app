#!/bin/sh
APP_HOME="$(dirname "$(readlink -f "$0" 2>/dev/null || echo "$0")")"
CLASSPATH="$APP_HOME/gradle/wrapper/gradle-wrapper.jar"
JAVACMD="${JAVA_HOME:+$JAVA_HOME/bin/java}"
JAVACMD="${JAVACMD:-java}"
exec "$JAVACMD" -Xmx64m -Xms64m -classpath "$CLASSPATH" org.gradle.wrapper.GradleWrapperMain "$@"