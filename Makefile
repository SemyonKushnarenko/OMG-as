.PHONY: SOUNDS ATLAS PRODUCTION ALL

TOOLS=../../eeditor/tools
LOG_LEVEL=debug
TARGET?=ALL

BUILD_:
	node ${TOOLS}/builder --target=${TARGET} --log=${LOG_LEVEL}

ALL:
	make BUILD_ TARGET=$@

ATLAS:
	make BUILD_ TARGET=$@

SOUNDS:
	make BUILD_ TARGET=$@

PRODUCTION:
	make BUILD_ TARGET=$@
