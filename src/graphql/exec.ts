import {ethers} from 'ethers';
import {
  DocumentNode,
  Kind,
  OperationTypeNode,
  ObjectTypeDefinitionNode,
  SelectionSetNode,
  SelectionNode,
  FieldNode,
  TypeNode,
  ArgumentNode,
  FieldDefinitionNode,
  ObjectValueNode,
  ObjectFieldNode,
} from 'graphql';
import get from 'lodash.get';

import {PendingTransaction} from '../@types';

import schema from '../../schema.graphql';
import {getMaybeFunctionForMaybeInterface} from "../ethereum";

export const getObjectTypeDefinitionByName = ({
  name,
}: {
  readonly name: string;
}) => {
  const [maybeObjectTypeDefinition] = schema.definitions.flatMap(
    (e) => (e.kind === Kind.OBJECT_TYPE_DEFINITION && e.name.value === name)
      ? [e]
      : [],
  );

  if (!maybeObjectTypeDefinition)
    throw new Error(`Failed to find ObjectTypeDefinition with name "${
      name
    }".`);

  return maybeObjectTypeDefinition;
};

export const getQueryDefinitions = (
  query: DocumentNode
) => {
  const {definitions} = query;
  const queryDefinitions = definitions.flatMap(
    e => {
      if (e.kind === Kind.OPERATION_DEFINITION && e.operation === OperationTypeNode.QUERY)
        return [e];

      return [];
    }
  );
  return {queryDefinitions};
};

export const ROOT_QUERY_TYPE_DEFINITION_NODE: ObjectTypeDefinitionNode = {
  kind: Kind.OBJECT_TYPE_DEFINITION,
  name: {value: '__CounterSoiree__', kind: Kind.NAME},
  fields: [{
    kind: Kind.FIELD_DEFINITION,
    name: {
      value: 'pendingTransaction',
      kind: Kind.NAME,
    },
    type: {
      kind: Kind.NAMED_TYPE,
      name: {
        kind: Kind.NAME,
        value: 'PendingTransaction',
      },
    },
  }],
};

// Determines if the provided result satisfies all args.
export const resultSatisfiesArguments = ({
  abi,
  typeNode,
  args,
  result,
}: {
  readonly abi: ethers.utils.Interface;
  readonly typeNode: TypeNode;
  readonly args: readonly ArgumentNode[];
  readonly result: unknown;
}): boolean => {
  const results = args.map(
    argument => resultSatisfiesArgument({
      abi,
      typeNode,
      argument,
      result,
    }),
  );
  return results.filter(e => !e).length === 0;
};

export const handleSelectionSet = ({
  abi,
  selectionSet,
  onInputValue,
  objectTypeDefinitionNode,
}: {
  readonly abi: ethers.utils.Interface;
  readonly selectionSet: SelectionSetNode;
  readonly onInputValue: unknown;
  readonly objectTypeDefinitionNode: ObjectTypeDefinitionNode;
}) => {
  const {selections} = selectionSet;
  return Object.assign(
    {},
    ...selections.map(
      (selectionNode: SelectionNode) =>  {
        const {kind} = selectionNode;
        if (kind === Kind.FIELD) {
          const {name, arguments: args} = selectionNode;

          const typeNode = getFieldTypeNode({
            field: selectionNode,
            objectTypeDefinitionNode,
          });

          const result = getSelectionSetFieldOn({
            abi,
            field: selectionNode,
            onInputValue,
            objectTypeDefinitionNode,
          });

          if (
            Array.isArray(args)
            && args.length
            && !(
              resultSatisfiesArguments({
                abi,
                typeNode,
                args,
                // Important! When filtering, we must operate over the entire source object; not just the fields in scope.
                result: get(onInputValue, name.value),
              })
            )
          )
            return {[name.value]: null};

          return {[name.value]: result};
        }

        throw new Error(`Encountered unsupported SelectionNode Kind, "${
          String(kind)
        }".`);
      },
    )
  );
};

export const getFieldTypeNode = ({
  field,
  objectTypeDefinitionNode,
}: {
  readonly field: FieldNode;
  readonly objectTypeDefinitionNode: ObjectTypeDefinitionNode;
}) => {
  const maybeSelectedField = objectTypeDefinitionNode
    .fields?.find(e => e.name.value === field.name.value);

  if (!maybeSelectedField)
    throw new Error(`Unable to find maybeSelectedField with name "${
      field.name.value
    }".`);

  const {type} = maybeSelectedField;
  return type;
};

export const getSelectionSetFieldOn = ({
  abi,
  field,
  onInputValue: defaultOnInputValue,
  objectTypeDefinitionNode,
}: {
  readonly abi: ethers.utils.Interface;
  readonly field: FieldNode;
  readonly onInputValue: unknown;
  readonly objectTypeDefinitionNode: ObjectTypeDefinitionNode;
}): unknown => {
  const {selectionSet} = field;

  const onInputValue = get(defaultOnInputValue, field.name.value) as unknown;

  if (selectionSet) {
    const type = getFieldTypeNode({
      field,
      objectTypeDefinitionNode,
    });

    if (type.kind !== Kind.NAMED_TYPE)
      throw new Error(`Expected named type, encountered ${
          JSON.stringify(type)
      }.`);

    return handleSelectionSet({
      abi,
      selectionSet,
      onInputValue,
      objectTypeDefinitionNode: getObjectTypeDefinitionByName({
        name: type.name.value,
      }),
    });
  }

  return onInputValue;
};

export const valueSatisfiesDataObjectArgumentInterfaceField = ({
  abi,
  field,
  value,
}: {
  readonly abi: ethers.utils.Interface;
  readonly field: ObjectFieldNode;
  readonly value: string;
}): boolean => {
  // Interfaces must be strings.
  if (field.value.kind !== Kind.STRING)
    return false;

  // The supplied interface.
  const {value: interfaceString} = field.value;

  const maybeFunction = getMaybeFunctionForMaybeInterface({
    abi,
    maybeInterface: interfaceString,
  });

  if (!maybeFunction)
    return false;

  return value.startsWith(abi.getSighash(maybeFunction));
};

export const valueSatisfiesDataObjectArgumentField = ({
  abi,
  field,
  value,
}: {
  readonly abi: ethers.utils.Interface;
  readonly field: ObjectFieldNode;
  readonly value: string;
}): boolean => {
  if (field.name.value === 'interface')
    return valueSatisfiesDataObjectArgumentInterfaceField({
      abi,
      field,
      value,
    });

  return false;
};

export const valueSatisfiesDataObjectArgument = ({
  abi,
  objectValueNode,
  value,
}: {
  readonly abi: ethers.utils.Interface;
  readonly objectValueNode: ObjectValueNode;
  readonly value: unknown;
}): boolean => {

  if (typeof value !== 'string')
    throw new Error(`Expected string transaction data, encountered ${typeof value}.`);

  const {fields} = objectValueNode;

  return fields.reduce<boolean>(
    (res, field) => res && valueSatisfiesDataObjectArgumentField({
      abi,
      field,
      value,
    }),
    true,
  );
};

export const valueSatisfiesObjectArgument = ({
  abi,
  fieldDefinitionNode,
  objectValueNode,
  value,
}: {
  readonly abi: ethers.utils.Interface;
  readonly fieldDefinitionNode: FieldDefinitionNode;
  readonly objectValueNode: ObjectValueNode;
  readonly value: unknown;
}) => {
  // Determine the data type.
  if (fieldDefinitionNode?.type?.kind !== Kind.NAMED_TYPE)
    throw new Error(`Expected named type, encountered "${
      String(fieldDefinitionNode?.type?.kind)
    }".`);


  const namedType = fieldDefinitionNode.type.name?.value;

  if (namedType === 'Data')
    return valueSatisfiesDataObjectArgument({
      abi,
      objectValueNode,
      value,
    });

  throw new Error(`Unable to resolve handler for namedType "${
    namedType
  }".`);
};

// Here we need to know the type of argument and stuff.
export const valueSatisfiesArgument = ({
  abi,
  fieldDefinitionNode,
  argument,
  value,
}: {
  readonly abi: ethers.utils.Interface;
  readonly fieldDefinitionNode: FieldDefinitionNode;
  readonly argument: ArgumentNode;
  readonly value: unknown;
}): boolean => {
  const {value: argumentValue} = argument;
  const {kind} = argumentValue;

  if (kind === Kind.STRING) {
    return typeof value === 'string' && value === argumentValue.value;
  } else if (kind === Kind.OBJECT) {
    return valueSatisfiesObjectArgument({
      abi,
      fieldDefinitionNode,
      objectValueNode: argumentValue,
      value,
    });
  }

  throw new Error(`Encountered unexpected argument kind, "${
      String(kind)
  }".`);
};

export const resultSatisfiesArgument = ({
  abi,
  typeNode,
  argument,
  result,
}: {
  readonly abi: ethers.utils.Interface;
  readonly typeNode: TypeNode;
  readonly argument: ArgumentNode;
  readonly result: unknown;
}): boolean => {
  const {name} = argument;

  if (typeof result !== 'object')
    throw new Error(`Expected object result, encountered ${typeof result}.`);

  if (!result)
    throw new Error(`Expected truthy result, encountered "${
        String(result)
    }".`);

  if (!(name.value in result)) return false;

  if (typeNode.kind !== Kind.NAMED_TYPE)
    throw new Error(`Expected named type, encountered "${
        typeNode.kind
    }".`);

  const objectTypeDefinitionNode = getObjectTypeDefinitionByName({
    name: typeNode.name.value,
  });

  const maybeFieldDefinitionNode = objectTypeDefinitionNode.fields?.find(e => e.name.value === name.value);

  if (!maybeFieldDefinitionNode)
    throw new Error(`Failed to find field by name "${name.value}".`);

  const value = get(result, name.value);

  return valueSatisfiesArgument({
    abi,
    fieldDefinitionNode: maybeFieldDefinitionNode,
    argument,
    value,
  });
};

export const exec = ({
  abi,
  pendingTransaction,
  query,
}: {
  readonly abi: ethers.utils.Interface;
  readonly pendingTransaction: PendingTransaction;
  readonly query: DocumentNode;
}) => {
  const {queryDefinitions} = getQueryDefinitions(query);
  return Object.assign(
   {},
    ...Object
      .values(queryDefinitions)
      .map(
        ({selectionSet}) => handleSelectionSet({
          abi,
          selectionSet,
          onInputValue: {pendingTransaction},
          objectTypeDefinitionNode: ROOT_QUERY_TYPE_DEFINITION_NODE,
        }),
      ),
  );
};
