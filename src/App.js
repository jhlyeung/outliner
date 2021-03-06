import React from 'react';
import logo from './logo.svg';
import uuidv1 from "uuid/v1";
import './App.css';
import { Block } from "./Block";
import { WritingArea } from "./WritingArea";
import { BlockProvider } from './BlockContext';

import { Table } from './Table';

import { Editor, EditorState, ContentState, SelectionState, RichUtils, getDefaultKeyBinding } from 'draft-js';

export default class App extends React.Component {
  constructor(props) {
    super(props);

    this.childrenRefs = {};
    this.addRef = this.addRef.bind(this);

    this.updateBlock = this.updateBlock.bind(this);
    this.indentBlock = this.indentBlock.bind(this);
    this.unindentBlock = this.unindentBlock.bind(this);
    this.addNewBlock = this.addNewBlock.bind(this);
    this.moveCursorUp = this.moveCursorUp.bind(this);
    this.moveCursorDown = this.moveCursorDown.bind(this);
    this.removeBlock = this.removeBlock.bind(this);
    this.updateUnderlinedBlock = this.updateUnderlinedBlock.bind(this);
    this.updateDraggedBlockId = this.updateDraggedBlockId.bind(this);
    this.updateMovedBlock = this.updateMovedBlock.bind(this);
    this.startBlockSelection = this.startBlockSelection.bind(this);
    this.toggleBlockSelection = this.toggleBlockSelection.bind(this);

    this.handleExportClick = this.handleExportClick.bind(this);

    this.handleSandboxKeyCommand = this.handleSandboxKeyCommand.bind(this);
    

    this.state = {
      docData: {},
      updateBlock: this.updateBlock,
      indentBlock: this.indentBlock,
      unindentBlock: this.unindentBlock,
      addNewBlock: this.addNewBlock,
      moveCursorUp: this.moveCursorUp,
      moveCursorDown: this.moveCursorDown,
      removeBlock: this.removeBlock,
      addRef: this.addRef,
      updateDraggedBlockId: this.updateDraggedBlockId,
      updateUnderlinedBlock: this.updateUnderlinedBlock,
      updateMovedBlock: this.updateMovedBlock,
      draggedBlockId: '',
      underlinedBlockId: '',
      // for block selection
      selectedBlocks: {},
      selectionStartBlockId: '',
      selectionStartIndex: 0,
      startBlockSelection: this.startBlockSelection,
      toggleBlockSelection: this.toggleBlockSelection,
      cursorOffset: 0,
      topLevelBlocks: [],  // top-level blocks
      editorState: EditorState.createEmpty() // draft.js editor sandbox
    };
  }

  componentDidMount() {
    this.initBlocks();
  }

  // global access to nested children via ref
  addRef(currBlockId, el) {
    this.childrenRefs[currBlockId] = el;
  }

  updateBlock(currBlockId, body, cursorOffset) {
    this.setState(prevState => ({
      docData: {
        ...prevState.docData,
        [currBlockId]: {
          ...prevState.docData[currBlockId],
          body: body
        }
      },
      cursorOffset: cursorOffset
    }));
  }

  // move block from top-level to top-level
  moveBlockTopToTop(currBlockId, newBlockId) {
    const docData = this.state.docData;
    let topLevelBlocks = this.state.topLevelBlocks.slice();

    const currBlockIndex = this.getTopLevelBlockIndex(currBlockId);
    topLevelBlocks.splice(currBlockIndex, 1);

    const newIndex = this.getTopLevelBlockIndex(newBlockId);
    this.setState({
      topLevelBlocks: [...topLevelBlocks.slice(0, newIndex+1), currBlockId, ...topLevelBlocks.slice(newIndex+1, topLevelBlocks.length)]
    });
  }

  moveBlockToTop(currBlockId, newBlockId) {
    const currBlockData = this.getBlockData(currBlockId);
    const prevParentId = currBlockData.parentId;
    const prevParentData = this.getBlockData(prevParentId);    
    const currBlockIndex = this.getBlockIndex(currBlockId, prevParentData.children);

    const topLevelBlocks = this.state.topLevelBlocks.slice();
    const prevParentIndex = this.getTopLevelBlockIndex(prevParentId);

    const newBlockIndex = this.getTopLevelBlockIndex(newBlockId);

    this.setState(prevState => ({
      docData: {
        ...prevState.docData,
        // update current block
        [currBlockId]: {
          ...currBlockData,
          parentId: ''
        },
        // update old parent
        [prevParentId]: {
          ...prevParentData,
          children: [...prevParentData.children.slice(0, currBlockIndex), ...prevParentData.children.slice(currBlockIndex+1, prevParentData.children.length)]
        }
      },
      // update new parent - adding to topLevelBlocks
      topLevelBlocks: [...topLevelBlocks.slice(0, newBlockIndex+1), currBlockId, ...topLevelBlocks.slice(newBlockIndex+1, topLevelBlocks.length)]
    }));
  }

  // TODO - account for index
  moveBlockFromTop(currBlockId, newParentId, newBlockId) {
    const docData = this.state.docData;
    const topLevelBlocks = this.state.topLevelBlocks;

    let currBlockData = this.getBlockData(currBlockId);
    const prevParentId = currBlockData.parentId;

    const currBlockIndex = this.getTopLevelBlockIndex(currBlockId);
    // Can't indent the first block at the top-level 
    if (currBlockIndex === 0) return;

    let newParentData = this.getBlockData(newParentId)
    
    // update current block
    currBlockData.parentId = newParentId;

    // update new parent      
    newParentData.children = [...newParentData.children, currBlockId];

    this.setState({
      docData: {
        ...docData,
        [currBlockId]: currBlockData,
        [newParentId]: newParentData
      },
      // update topLevelBlocks
      topLevelBlocks: [...topLevelBlocks.slice(0, currBlockIndex), ...topLevelBlocks.slice(currBlockIndex+1, topLevelBlocks.length)]
    });
  }

  // TODO - add index of child
  moveBlock(currBlockId, newParentId, newBlockId) {
    const docData = this.state.docData;
    const topLevelBlocks = this.state.topLevelBlocks;

    let currBlockData = this.getBlockData(currBlockId);
    const prevParentId = currBlockData.parentId;

    if (!newParentId && !prevParentId) {
      this.moveBlockTopToTop(currBlockId, newBlockId);
      return;
    }

    if (newParentId && !prevParentId) {
      this.moveBlockFromTop(currBlockId, newParentId, newBlockId);
      return;
    }

    if (!newParentId && prevParentId) {
      this.moveBlockToTop(currBlockId, newBlockId);
      return;
    }

    // same parent
    if (prevParentId === newParentId) {
      const parentBlockData = this.getBlockData(newParentId);
      let siblings = parentBlockData.children.slice();

      // remove, then reinsert
      const currBlockIndex = this.getBlockIndex(currBlockId, siblings);
      siblings.splice(currBlockIndex, 1);

      const newIndex = this.getBlockIndex(newBlockId, siblings);

      this.setState({
        docData: {
          ...docData,
          [newParentId]: {
            ...parentBlockData,
            children: [...siblings.slice(0, newIndex+1), currBlockId, ...siblings.slice(newIndex+1, siblings.length)]
          }
        }        
      });

      return;
    }
    
    // add current block to children of the new parent
    const prevParentData = this.getBlockData(prevParentId);
    const newParentData = this.getBlockData(newParentId);

    let newParentChildren = newParentData.children.slice();
    let prevParentChildren = prevParentData.children.slice();

    const currBlockIndex = this.getBlockIndex(currBlockId, prevParentChildren);
    prevParentChildren.splice(currBlockIndex, 1);

    const newBlockIndex = this.getBlockIndex(newBlockId, newParentChildren);
    newParentChildren = [...newParentData.children.slice(0, newBlockIndex+1), currBlockId, ...newParentData.children.slice(newBlockIndex+1, newParentData.children.length)];

    this.setState(prevState => ({
      docData: {
        ...prevState.docData,
        [currBlockId]: {
          ...currBlockData,
          parentId: newParentId
        },
        [prevParentId]: {
          ...prevParentData,
          children: prevParentChildren
        },
        [newParentId]: {
          ...newParentData,
          children: newParentChildren
        }
      }
    }));
  }

  indentBlock(currBlockId, prevParentId) {
    const docData = this.state.docData;
    const topLevelBlocks = this.state.topLevelBlocks;

    // Top-level
    if (!prevParentId) {
      const currBlockIndex = this.getTopLevelBlockIndex(currBlockId);
      // Can't indent the first block at the top-level 
      if (currBlockIndex === 0) return;

      const newParentId = topLevelBlocks[currBlockIndex-1];
      this.moveBlockFromTop(currBlockId, newParentId);
      return;      
    } 

    const prevParentData = this.getBlockData(prevParentId);
    const currBlockIndex = this.getBlockIndex(currBlockId, prevParentData.children); 
    const newParentId = prevParentData.children[currBlockIndex-1];
    let newParentData = this.getBlockData(newParentId)
    let currBlockData = this.getBlockData(currBlockId);

    // Disable invalid indenting
    if (!newParentData) return;

    // update current block
    currBlockData.parentId = newParentId;

    // update prev parent
    prevParentData.children = [...prevParentData.children.slice(0, currBlockIndex), ...prevParentData.children.slice(currBlockIndex+1, prevParentData.children.length)];

    // update new parent      
    newParentData.children = [...newParentData.children, currBlockId];

    this.setState({
      docData: {
        ...docData,
        [currBlockId]: currBlockData,
        [prevParentId]: prevParentData,
        [newParentId]: newParentData
      },
    });
  }

  unindentBlock(currBlockId, prevParentId) {
    if (!prevParentId) return;

    let prevParentData = this.getBlockData(prevParentId);
    const newParentId = prevParentData.parentId;
    let currBlockData = this.getBlockData(currBlockId);
    const currBlockIndex = this.getBlockIndex(currBlockId, prevParentData.children);

    // unindenting to top-level
    if (!newParentId) {
      this.moveBlockToTop(currBlockId, prevParentId);
      return;
    }

    // add current block to children of the new parent
    let newParentData = this.getBlockData(newParentId);
    const prevParentIndex = this.getBlockIndex(prevParentId, newParentData.children); 

    this.setState(prevState => ({
      docData: {
        ...prevState.docData,
        [currBlockId]: {
          ...currBlockData,
          parentId: newParentId
        },
        [prevParentId]: {
          ...prevParentData,
          children: [...prevParentData.children.slice(0, currBlockIndex), ...prevParentData.children.slice(currBlockIndex+1, prevParentData.children.length)]
        },
        [newParentId]: {
          ...newParentData,
          children: [...newParentData.children.slice(0, prevParentIndex+1), currBlockId, ...newParentData.children.slice(prevParentIndex+1, newParentData.children.length)]
        }
      }
    }));
  }

  getBlockData(blockId) {
    return this.state.docData[blockId];
  }

  // for top-level blocks
  getTopLevelBlockIndex(parentId) {
    return this.state.topLevelBlocks.findIndex(blockId => {
      return blockId === parentId
    });
  }

  // return index in the given blocks array
  getBlockIndex(currBlockId, blocks) {
    return blocks.findIndex(blockId => {
      return blockId === currBlockId
    });
  }

  getNextSiblingId(blockId) {
    const blockData = this.getBlockData(blockId);
    if (!blockData.parentId) {
      const blockIndex = this.getTopLevelBlockIndex(blockId);
      if (blockIndex < this.state.topLevelBlocks.length-1) {
        return this.state.topLevelBlocks[blockIndex+1];
      }
      return '';
    }

    const parentBlockData = this.getBlockData(blockData.parentId);
    const blockIndex = this.getBlockIndex(blockId, parentBlockData.children);
    if (blockIndex < parentBlockData.children.length-1) {
      return parentBlockData.children[blockIndex+1];
    }
    return '';
  }

  // recursively get the last child 
  getLastNestedChild(blockId) {
    const blockData = this.getBlockData(blockId);
    
    if (blockData.children.length === 0) return blockId;

    return this.getLastNestedChild(blockData.children[blockData.children.length-1]);
  }

  // recursively go up tree, until we find a valid parent, or reach the top
  getNextClosestParentId(blockId) {
    const blockData = this.getBlockData(blockId);

    // reached the top
    if (blockData.parentId === '') return '';

    // check if current parent has more siblings
    const nextSiblingId = this.getNextSiblingId(blockData.parentId);

    if (nextSiblingId === '') {
      return this.getNextClosestParentId(blockData.parentId);
    }
    return nextSiblingId;
  }

  newBlock(parentId) {
    const blockId = uuidv1();
    const block = { id: blockId, body: '', children: [], parentId: parentId ? parentId : '' };

    this.setState(prevState => ({ 
      docData: {
        ...prevState.docData,
        [blockId]: block
      }
    }));
    return block;
  }

  initBlocks() {
    this.setState({ topLevelBlocks: [...this.state.topLevelBlocks, this.newBlock().id] });
  }

  addNewBlock(currBlockId, parentBlockId) {
    // top-level
    if (!parentBlockId) {
      const currBlockIndex = this.getTopLevelBlockIndex(currBlockId);
      const topLevelBlocks = this.state.topLevelBlocks;

      this.setState({ topLevelBlocks: [...topLevelBlocks.slice(0, currBlockIndex+1), this.newBlock().id, ...topLevelBlocks.slice(currBlockIndex+1, topLevelBlocks.length)] });
      return;
    }

    const parentBlockData = this.getBlockData(parentBlockId);
    const currBlockIndex = this.getBlockIndex(currBlockId, parentBlockData.children);

    const currBlockData = this.getBlockData(currBlockId);
    // if last child, append new block
    if (currBlockIndex === parentBlockData.children.length-1 && currBlockData.children.length === 0) {
      const newBlock = this.newBlock(parentBlockId);
      this.setState(prevState => ({
        docData: {
          ...prevState.docData,
          [parentBlockId]: {
            ...parentBlockData,
            children: [...parentBlockData.children, newBlock.id]
          }
        }
      }));
      return;
    }

    const newBlock = this.newBlock(currBlockId);
    // if current block has nested children
    // prepend new block to children
    this.setState(prevState => ({
      docData: {
        ...prevState.docData,
        [currBlockId]: {
          ...currBlockData,
          children: [newBlock.id, ...currBlockData.children]
        }
      }
    }));
  }

  removeBlock(currBlockId) {
    const currBlockData = this.getBlockData(currBlockId);
    if (!currBlockData.parentId) {
      const currBlockIndex = this.getTopLevelBlockIndex(currBlockId);
      const topLevelBlocks = this.state.topLevelBlocks;

      // can't remove the first block
      if (currBlockIndex === 0) return;

      this.moveCursorUp(currBlockId);
      this.setState({ 
        topLevelBlocks: [...topLevelBlocks.slice(0, currBlockIndex), ...topLevelBlocks.slice(currBlockIndex+1, topLevelBlocks.length)]
      });
      return;
    }

    const parentBlockData = this.getBlockData(currBlockData.parentId);
    const currBlockIndex = this.getBlockIndex(currBlockId, parentBlockData.children);

    this.moveCursorUp(currBlockId);
    this.setState(prevState => ({
      docData: {
        ...prevState.docData,
        [currBlockId]: undefined, // removing from data
        [currBlockData.parentId]: {
          ...parentBlockData,
          children: [...parentBlockData.children.slice(0, currBlockIndex), ...parentBlockData.children.slice(currBlockIndex+1, parentBlockData.children.length)]
        }
      }
    }));
  }

  moveCursorUp(currBlockId) {
    const currBlockData = this.getBlockData(currBlockId);
    let targetBlockData;
    
    // top-level
    if (!currBlockData.parentId) {
      // index
      const currBlockIndex = this.getTopLevelBlockIndex(currBlockId);
      
      // the first block
      if (currBlockIndex < 1) return;

      const lastSiblingId = this.state.topLevelBlocks[currBlockIndex-1];
      const targetBlockId = this.getLastNestedChild(lastSiblingId);
      targetBlockData = this.getBlockData(targetBlockId);
    }
    else {
      const parentBlockData = this.getBlockData(currBlockData.parentId);
      const currBlockIndex = this.getBlockIndex(currBlockId, parentBlockData.children);
      
      // first child
      if (currBlockIndex === 0) {
        targetBlockData = parentBlockData;
      }
      else {
        // go to the last child 
        const lastSiblingId = parentBlockData.children[currBlockIndex-1];
        const targetBlockId = this.getLastNestedChild(lastSiblingId); 
        targetBlockData = this.getBlockData(targetBlockId);
      }
    }

    this.childrenRefs[targetBlockData.id].contentRef.current.focus();
  }

  moveCursorDown(currBlockId) {
    const currBlockData = this.getBlockData(currBlockId);
    let targetBlockData;
    
    // top-level
    if (!currBlockData.parentId) {
      // index
      const currBlockIndex = this.getTopLevelBlockIndex(currBlockId);
      
      // go to first child 
      if (currBlockData.children.length > 0) {
        const targetBlockId = currBlockData.children[0];
        targetBlockData = this.getBlockData(targetBlockId)
      } 
      // next sibling
      else {
        const targetBlockId = this.state.topLevelBlocks[currBlockIndex+1];
        targetBlockData = this.getBlockData(targetBlockId); 
      }
    }
    else {
      const parentBlockData = this.getBlockData(currBlockData.parentId);
      const currBlockIndex = this.getBlockIndex(currBlockId, parentBlockData.children);
      let targetBlockId;

      // go to first child 
      if (currBlockData.children.length > 0) {
        targetBlockId = currBlockData.children[0];
      } 
      // next sibling if not last child
      else if (currBlockIndex < parentBlockData.children.length-1) {
        targetBlockId = parentBlockData.children[currBlockIndex+1];
      }
      else {
        targetBlockId = this.getNextClosestParentId(currBlockId);
      }

      targetBlockData = this.getBlockData(targetBlockId);
      
    }

    if (!targetBlockData) return;

    this.childrenRefs[targetBlockData.id].contentRef.current.focus();
  }

  updateDraggedBlockId(blockId, isDragging) {
    if (isDragging && !this.state.draggedBlockId) {
      this.setState({ draggedBlockId: blockId });
    } 
    else {
      this.setState({ draggedBlockId: '' });
    }
  }

  updateUnderlinedBlock(blockId, isUnderlined) {
    if (blockId === this.state.draggedBlockId) return;

    if (!this.state.draggedBlockId) return;

    if (isUnderlined) {
      if (this.state.underlinedBlockId === blockId) return;
      this.setState({ underlinedBlockId: blockId });

      return;
    }

    // remove underline
    if (this.state.underlinedBlockId === blockId || !blockId) {
      this.setState({ underlinedBlockId: '' });
    }
  }

  updateMovedBlock(targetBlockId) {
    if (!this.state.draggedBlockId || this.state.draggedBlockId === targetBlockId) return;

    const currentBlockData = this.getBlockData(this.state.draggedBlockId);
    const targetBlockData = this.getBlockData(targetBlockId);
    
    // let targetBlockIndex;
    // if (targetBlockData.parentId) {
    //   const targetParentData = this.getBlockData(targetBlockData.parentId);
    //   targetBlockIndex = this.getBlockIndex(targetBlockId, targetParentData.children);
    // }
    // else {
    //   targetBlockIndex = this.getTopLevelBlockIndex(targetBlockId);
    // }

    this.moveBlock(this.state.draggedBlockId, targetBlockData.parentId, targetBlockId);
    this.setState({
      draggedBlockId: '',
      underlinedBlockId: ''
    });
  }

  // TODO - call this method
  clearBlockSelection() {
    this.setState({
      selectedBlocks: {},
      selectionStartIndex: 0,
      selectionStartBlockId: ''
    });
  }

  startBlockSelection(blockId, blockContentIndex) {
    console.log(blockId, blockContentIndex);
    this.setState(prevState => ({ 
      // clear the previous selection
      selectedBlocks: {
        [blockId]: true
      },
      selectionStartIndex: blockContentIndex,
      selectionStartBlockId: blockId
    }));
  }

  toggleBlockSelection(blockId, blockContentIndex) {
    console.log(blockId, blockContentIndex);
    if (blockId === this.state.selectionStartBlockId) return;

    let selectedBlocks = Object.assign({}, this.state.selectedBlocks);
    // toggle selection
    if (selectedBlocks[blockId] === true) {
      delete selectedBlocks[blockId];
    }
    else {
      selectedBlocks[blockId] = true;
    }

    this.setState({
      selectedBlocks: selectedBlocks
    });
  }

  buildBlocks() {
    return this.state.topLevelBlocks.map(blockId => {
      return (
        <Block 
          ref={blockId}
          key={blockId}
          blockId={blockId}
          addNewBlock={this.addNewBlock}
          // parent={this}
        />
      );
    });
  }

  handleExportClick() {

    this.exportDocToJson();
  }

  exportDocToJson() {
    // TODO - go through all the data, render into a full doc tree

    // do we need a tree? or do we need a markdown?
    console.log(this.state.docData, this.state.topLevelBlocks);
    let output = { root: [] };

    // traversal
    this.state.topLevelBlocks.forEach(blockId => {

    });

    // print itself
    // traverse children

    
    // export to markdown?


  }

  exportDocToMarkdown() {
    // TODO - tree to markdown 
  }

  importDocData() {
    // how does it work with 
    

    // how would we load? 

    // we're keeping track of blocks by ID, to avoid duplicates
    // to allow for linking
    // but what is the right linking behavior?


  }

  handleSandboxKeyCommand(command, editorState) {
    const newState = RichUtils.handleKeyCommand(editorState, command);
    if (newState) {
      this.onChange(newState);
      return 'handled';
    }
    return 'not-handled';
  }

  render() {
    return(
      <div>
        <div className="header">
          <div
            className="export-btn"
            onClick={this.handleExportClick}>
            Export
          </div>
        </div>
        <div className="page-content">
          <div className="document">
            <BlockProvider 
              value={this.state}
            >
              { this.buildBlocks() }
            </BlockProvider>

          </div>
          <br /><br /><br />
        </div>
      </div>
    );
  }

        // <h4>Table sandbox</h4>
        // <Table />
        // <h3>Draft.js sandbox</h3>
        // <Editor 
        //   editorState={this.state.editorState}
        //   handleKeyCommand={this.handleSandboxKeyCommand}
        //   onChange={(editorState) => this.setState({editorState})} 
        // />
}
